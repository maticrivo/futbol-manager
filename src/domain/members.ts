import type { Db } from '@/db'
import { accounts, users } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { writeAudit } from './audit'
import { revokeUserSessions } from './sessions'

export type MemberRow = typeof users.$inferSelect
export type Member = Omit<MemberRow, 'name'> & { name: string }

export function toMember(row: MemberRow): Member {
  return {
    ...row,
    name: row.name?.trim() || row.email?.split('@')[0] || 'Player',
  }
}

export async function listMembers(db: Db): Promise<Member[]> {
  const rows = await db
    .select()
    .from(users)
    .orderBy(
      sql`lower(coalesce(nullif(trim(${users.name}), ''), split_part(${users.email}, '@', 1), 'Player'))`,
      asc(users.id)
    )
  return rows.map(toMember)
}

export async function createMember(
  db: Db,
  input: {
    name: string
    email?: string | null
    role?: 'member' | 'admin'
    locale?: string
    status?: 'active' | 'disabled' | 'pending'
    phone?: string | null
    nickname?: string | null
    image?: string | null
  }
): Promise<{ member: Member }> {
  const normalizedEmail = input.email?.trim().toLowerCase() || null
  const normalizedPhone = input.phone?.trim() || null
  const normalizedNickname = input.nickname?.trim() || null
  const normalizedImage = input.image?.trim() || null

  return await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: normalizedEmail,
        phone: normalizedPhone,
        nickname: normalizedNickname,
        image: normalizedImage,
        role: input.role ?? 'member',
        locale: input.locale ?? 'en',
        status: input.status ?? 'active',
      })
      .returning()

    const member = toMember(inserted)

    await writeAudit(tx, {
      actorId: member.id,
      action: 'member.create',
      entity: 'member',
      entityId: member.id,
      detail: {
        name: member.name,
        role: member.role,
        locale: member.locale,
        email: member.email,
      },
    })

    return { member }
  })
}

export async function setMemberStatus(
  db: Db,
  actorId: string,
  memberId: string,
  status: 'active' | 'disabled' | 'pending'
): Promise<Result<Member, 'FORBIDDEN' | 'NOT_FOUND'>> {
  return await db.transaction(async (tx) => {
    // Global lock order: user rows first, in ascending text-id order.
    const ids = Array.from(new Set([actorId, memberId])).sort()

    const lockedMembers = await tx
      .select()
      .from(users)
      .where(inArray(users.id, ids))
      .for('update')
      .orderBy(asc(users.id))

    const actor = lockedMembers.find((m) => m.id === actorId)
    if (!actor || actor.role !== 'admin') {
      return err('FORBIDDEN')
    }

    const target = lockedMembers.find((m) => m.id === memberId)
    if (!target) {
      return err('NOT_FOUND')
    }

    // An admin cannot disable their own account or set it to pending.
    if (actorId === memberId && (status === 'disabled' || status === 'pending')) {
      return err('FORBIDDEN')
    }

    await tx
      .update(users)
      .set({ status })
      .where(eq(users.id, memberId))

    if (status === 'disabled') {
      await revokeUserSessions(tx, memberId)
    }

    await writeAudit(tx, {
      actorId,
      action: 'member.status',
      entity: 'member',
      entityId: memberId,
      detail: { status },
    })

    const [updated] = await tx
      .select()
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1)

    return ok(toMember(updated!))
  })
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (trimmed.length === 0 || trimmed.length > 254) return false
  const localPartLength = trimmed.lastIndexOf('@')
  if (localPartLength < 1 || localPartLength > 64) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export type MemberProfilePatch = {
  name?: string
  email?: string | null
  phone?: string | null
  nickname?: string | null
  image?: string | null
}

export type UpdateMemberProfileError =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_NAME'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'INVALID_IMAGE'
  | 'EMAIL_TAKEN'

export async function updateMemberProfile(
  db: Db,
  input: {
    actorId: string
    memberId: string
    patch: MemberProfilePatch
  },
  now: Date = new Date()
): Promise<Result<Member, UpdateMemberProfileError>> {
  const { actorId, memberId, patch } = input

  let trimmedName: string | undefined
  if (patch.name !== undefined) {
    trimmedName = patch.name.trim()
    if (trimmedName.length === 0 || trimmedName.length > 120) {
      return err('INVALID_NAME')
    }
  }

  let normalizedNickname: string | null | undefined
  if (patch.nickname !== undefined) {
    if (patch.nickname === null || patch.nickname.trim() === '') {
      normalizedNickname = null
    } else {
      const trimmed = patch.nickname.trim()
      if (trimmed.length > 60) {
        return err('INVALID_NAME')
      }
      normalizedNickname = trimmed
    }
  }

  let normalizedPhone: string | null | undefined
  if (patch.phone !== undefined) {
    if (patch.phone === null || patch.phone.trim() === '') {
      normalizedPhone = null
    } else {
      const trimmed = patch.phone.trim()
      if (trimmed.length > 40) {
        return err('INVALID_PHONE')
      }
      const digits = trimmed.match(/\d/g) ?? []
      if (digits.length < 5) {
        return err('INVALID_PHONE')
      }
      if (!/^[0-9\s+\-().\u2010\u2011\u2013\u2014]+$/.test(trimmed)) {
        return err('INVALID_PHONE')
      }
      normalizedPhone = trimmed
    }
  }

  let normalizedImage: string | null | undefined
  if (patch.image !== undefined) {
    if (patch.image === null || patch.image.trim() === '') {
      normalizedImage = null
    } else {
      const trimmed = patch.image.trim()
      if (trimmed.length > 2_000_000) {
        return err('INVALID_IMAGE')
      }
      const isHttp = /^https?:\/\//i.test(trimmed)
      const isDataUri = /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(trimmed)
      if (!isHttp && !isDataUri) {
        return err('INVALID_IMAGE')
      }
      if (isHttp) {
        try {
          const parsed = new URL(trimmed)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return err('INVALID_IMAGE')
          }
        } catch {
          return err('INVALID_IMAGE')
        }
      }
      normalizedImage = trimmed
    }
  }

  let normalizedEmail: string | null | undefined
  if (patch.email !== undefined) {
    if (patch.email === null || patch.email.trim() === '') {
      return err('INVALID_EMAIL')
    }
    const trimmed = patch.email.trim()
    if (!isValidEmail(trimmed)) {
      return err('INVALID_EMAIL')
    }
    normalizedEmail = trimmed.toLowerCase()
  }

  return await db.transaction(async (tx) => {
    // Global lock order: user rows ascending by text id.
    const ids = Array.from(new Set([actorId, memberId])).sort()

    const lockedMembers = await tx
      .select()
      .from(users)
      .where(inArray(users.id, ids))
      .for('update')
      .orderBy(asc(users.id))

    const actor = lockedMembers.find((m) => m.id === actorId)
    if (!actor) {
      return err('FORBIDDEN')
    }

    if (actor.id !== memberId && actor.role !== 'admin') {
      return err('FORBIDDEN')
    }

    const target = lockedMembers.find((m) => m.id === memberId)
    if (!target) {
      return err('NOT_FOUND')
    }

    // Email is the social account-linking key and is provider-owned once set.
    if (normalizedEmail !== undefined && normalizedEmail !== target.email) {
      return err('INVALID_EMAIL')
    }

    const changedFields: string[] = []
    const updates: Partial<{
      name: string
      email: string | null
      phone: string | null
      nickname: string | null
      image: string | null
      updatedAt: Date
    }> = {
      updatedAt: now,
    }

    if (trimmedName !== undefined) {
      if (trimmedName !== target.name) changedFields.push('name')
      updates.name = trimmedName
    }
    if (normalizedEmail !== undefined) {
      if (normalizedEmail !== target.email) changedFields.push('email')
      updates.email = normalizedEmail
    }
    if (normalizedPhone !== undefined) {
      if (normalizedPhone !== target.phone) changedFields.push('phone')
      updates.phone = normalizedPhone
    }
    if (normalizedNickname !== undefined) {
      if (normalizedNickname !== target.nickname) changedFields.push('nickname')
      updates.nickname = normalizedNickname
    }
    if (normalizedImage !== undefined) {
      if (normalizedImage !== target.image) changedFields.push('image')
      updates.image = normalizedImage
    }

    await tx.update(users).set(updates).where(eq(users.id, memberId))

    await writeAudit(tx, {
      actorId,
      action: 'member.profile_update',
      entity: 'member',
      entityId: memberId,
      detail: { fields: changedFields },
      createdAt: now,
    })

    const [updated] = await tx
      .select()
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1)

    return ok(toMember(updated!))
  })
}

export type LinkPendingMemberError =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_PENDING'
  | 'TARGET_NOT_ACTIVE'
  | 'SAME_MEMBER'

export async function linkPendingMemberToMember(
  db: Db,
  input: { actorId: string; pendingId: string; targetId: string },
  now: Date = new Date()
): Promise<Result<Member, LinkPendingMemberError>> {
  const { actorId, pendingId, targetId } = input

  return await db.transaction(async (tx) => {
    const ids = Array.from(new Set([actorId, pendingId, targetId])).sort()
    const lockedMembers = await tx
      .select()
      .from(users)
      .where(inArray(users.id, ids))
      .for('update')
      .orderBy(asc(users.id))

    const actor = lockedMembers.find((member) => member.id === actorId)
    if (!actor || actor.role !== 'admin') {
      return err('FORBIDDEN')
    }

    if (pendingId === targetId) {
      return err('SAME_MEMBER')
    }

    const pending = lockedMembers.find((member) => member.id === pendingId)
    const target = lockedMembers.find((member) => member.id === targetId)
    if (!pending || !target) {
      return err('NOT_FOUND')
    }
    if (pending.status !== 'pending') {
      return err('NOT_PENDING')
    }
    if (target.status !== 'active') {
      return err('TARGET_NOT_ACTIVE')
    }

    const accountRows = await tx
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, pendingId))
    const providers = Array.from(new Set(accountRows.map((row) => row.provider)))

    await tx.update(accounts).set({ userId: targetId }).where(eq(accounts.userId, pendingId))
    await tx.delete(users).where(eq(users.id, pendingId))

    await writeAudit(tx, {
      actorId,
      action: 'member.link_account',
      entity: 'member',
      entityId: targetId,
      detail: { pendingId, targetId, providers },
      createdAt: now,
    })

    return ok(toMember(target))
  })
}
