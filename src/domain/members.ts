import type { Db } from '@/db'
import { loginTokens, members, sessions } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { generateToken, hashToken } from '@/lib/tokens'
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { writeAudit } from './audit'
import { revokeSessions, SESSION_LIFETIME_MS } from './sessions'
import { sendMagicLinkEmail } from '@/lib/email'

export type Member = typeof members.$inferSelect

export { revokeSessions } from './sessions'

export async function listMembers(db: Db): Promise<Member[]> {
  return db.select().from(members).orderBy(asc(members.name), asc(members.id))
}

export async function createMember(
  db: Db,
  input: {
    name: string
    role?: 'member' | 'admin'
    locale?: string
    status?: 'active' | 'disabled' | 'pending'
    email?: string | null
    phone?: string | null
    nickname?: string | null
    image?: string | null
  }
): Promise<{ member: Member; inviteToken: string }> {
  const inviteToken = generateToken()
  const tokenHash = hashToken(inviteToken)

  const normalizedEmail = input.email?.trim().toLowerCase() || null
  const normalizedPhone = input.phone?.trim() || null
  const normalizedNickname = input.nickname?.trim() || null
  const normalizedImage = input.image?.trim() || null

  return await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(members)
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
      .$returningId()

    const [member] = await tx
      .select()
      .from(members)
      .where(eq(members.id, inserted.id))
      .limit(1)

    if (!member) {
      throw new Error(`Failed to retrieve newly created member ${inserted.id}`)
    }

    await tx.insert(loginTokens).values({
      memberId: member.id,
      tokenHash,
    })

    await writeAudit(tx, {
      actorId: member.id,
      action: 'member.create',
      entity: 'member',
      entityId: String(member.id),
      detail: {
        name: member.name,
        role: member.role,
        locale: member.locale,
        email: member.email,
      },
    })

    return { member, inviteToken }
  })
}

export async function regenerateInvite(
  db: Db,
  actorId: number,
  memberId: number,
  now: Date = new Date()
): Promise<Result<{ inviteToken: string }, 'FORBIDDEN' | 'NOT_FOUND'>> {
  return await db.transaction(async (tx) => {
    // Global lock order: member rows first, ordered by ascending id
    const ids = Array.from(new Set([actorId, memberId])).sort((a, b) => a - b)

    const lockedMembers = await tx
      .select()
      .from(members)
      .where(inArray(members.id, ids))
      .for('update')
      .orderBy(asc(members.id))

    const actor = lockedMembers.find((m) => m.id === actorId)
    if (!actor || actor.role !== 'admin') {
      return err('FORBIDDEN')
    }

    const target = lockedMembers.find((m) => m.id === memberId)
    if (!target) {
      return err('NOT_FOUND')
    }

    const inviteToken = generateToken()
    const tokenHash = hashToken(inviteToken)

    // Token writes first: revoke outstanding tokens and insert replacement
    await tx
      .update(loginTokens)
      .set({ revokedAt: now })
      .where(and(eq(loginTokens.memberId, memberId), isNull(loginTokens.revokedAt)))

    await tx.insert(loginTokens).values({
      memberId,
      tokenHash,
    })

    // Session writes second: delete existing sessions
    await revokeSessions(tx, memberId)

    await writeAudit(tx, {
      actorId,
      action: 'member.regenerate_invite',
      entity: 'member',
      entityId: String(memberId),
    })

    return ok({ inviteToken })
  })
}

export async function loginWithInvite(
  db: Db,
  rawToken: string,
  now: Date
): Promise<Result<{ member: Member; sessionToken: string }, 'INVALID_TOKEN' | 'DISABLED'>> {
  const tokenHash = hashToken(rawToken)

  return await db.transaction(async (tx) => {
    // 1. Find memberId without lock to establish global lock hierarchy
    const [tokenLookup] = await tx
      .select({
        memberId: loginTokens.memberId,
      })
      .from(loginTokens)
      .where(eq(loginTokens.tokenHash, tokenHash))
      .limit(1)

    if (!tokenLookup) {
      return err('INVALID_TOKEN')
    }

    // 2. Global lock order: member rows first
    const [member] = await tx
      .select()
      .from(members)
      .where(eq(members.id, tokenLookup.memberId))
      .for('update')
      .limit(1)

    if (!member) {
      return err('INVALID_TOKEN')
    }

    // 3. Global lock order: login-token row second
    const [token] = await tx
      .select()
      .from(loginTokens)
      .where(eq(loginTokens.tokenHash, tokenHash))
      .for('update')
      .limit(1)

    // 4. Re-check eligibility under exclusive locks
    if (!token || token.revokedAt !== null) {
      return err('INVALID_TOKEN')
    }

    if (member.status === 'disabled') {
      return err('DISABLED')
    }

    const sessionToken = generateToken()
    const sessionTokenHash = hashToken(sessionToken)
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS)

    await tx
      .update(loginTokens)
      .set({ lastUsedAt: now })
      .where(eq(loginTokens.id, token.id))

    // 5. Global lock order: session row third
    await tx.insert(sessions).values({
      memberId: member.id,
      tokenHash: sessionTokenHash,
      expiresAt,
    })

    await writeAudit(tx, {
      actorId: member.id,
      action: 'auth.login',
      entity: 'member',
      entityId: String(member.id),
    })

    return ok({ member, sessionToken })
  })
}

export async function setMemberStatus(
  db: Db,
  actorId: number,
  memberId: number,
  status: 'active' | 'disabled' | 'pending'
): Promise<Result<Member, 'FORBIDDEN' | 'NOT_FOUND'>> {
  return await db.transaction(async (tx) => {
    // Global lock order: member rows first, ordered by ascending id
    const ids = Array.from(new Set([actorId, memberId])).sort((a, b) => a - b)

    const lockedMembers = await tx
      .select()
      .from(members)
      .where(inArray(members.id, ids))
      .for('update')
      .orderBy(asc(members.id))

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
      .update(members)
      .set({ status })
      .where(eq(members.id, memberId))

    if (status === 'disabled') {
      await revokeSessions(tx, memberId)
    }

    await writeAudit(tx, {
      actorId,
      action: 'member.status',
      entity: 'member',
      entityId: String(memberId),
      detail: { status },
    })

    const [updated] = await tx
      .select()
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1)

    return ok(updated!)
  })
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (trimmed.length === 0 || trimmed.length > 254) return false
  const localPartLength = trimmed.lastIndexOf('@')
  if (localPartLength < 1 || localPartLength > 64) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export async function requestMemberAccess(
  db: Db,
  email: string,
  now: Date = new Date(),
  profile: {
    name?: string
    nickname?: string
    phone?: string
    image?: string
  } = {}
): Promise<Result<{ memberId: number; inviteToken: string; member: Member }, 'INVALID_EMAIL'>> {
  const trimmedEmail = email.trim()
  if (!isValidEmail(trimmedEmail)) {
    return err('INVALID_EMAIL')
  }

  const normalizedEmail = trimmedEmail.toLowerCase()
  const inviteToken = generateToken()
  const tokenHash = hashToken(inviteToken)

  const { member } = await db.transaction(async (tx) => {
    // 1. Look up existing member: first by email, then legacy name
    let [existing] = await tx
      .select()
      .from(members)
      .where(eq(members.email, normalizedEmail))
      .for('update')
      .limit(1)

    if (!existing) {
      ;[existing] = await tx
        .select()
        .from(members)
        .where(or(eq(members.name, trimmedEmail), eq(members.name, normalizedEmail)))
        .for('update')
        .limit(1)
    }

    if (existing) {
      // Revoke outstanding unrevoked login tokens
      await tx
        .update(loginTokens)
        .set({ revokedAt: now })
        .where(and(eq(loginTokens.memberId, existing.id), isNull(loginTokens.revokedAt)))

      await tx.insert(loginTokens).values({
        memberId: existing.id,
        tokenHash,
      })

      await writeAudit(tx, {
        actorId: existing.id,
        action: 'auth.magic_link_request',
        entity: 'member',
        entityId: String(existing.id),
        detail: {
          email: existing.email ?? existing.name,
          status: existing.status,
        },
      })

      return { member: existing }
    }

    // 2. Insert new pending member
    const [localPart] = normalizedEmail.split('@')
    const finalName = (profile.name?.trim() || localPart || 'member').slice(0, 120)
    const finalNickname = profile.nickname?.trim() ? profile.nickname.trim().slice(0, 60) : null
    const finalPhone = profile.phone?.trim() ? profile.phone.trim().slice(0, 40) : null
    const finalImage = profile.image?.trim() ? profile.image.trim().slice(0, 500) : null

    const [inserted] = await tx
      .insert(members)
      .values({
        name: finalName,
        email: normalizedEmail,
        nickname: finalNickname,
        phone: finalPhone,
        image: finalImage,
        role: 'member',
        locale: 'en',
        status: 'pending',
      })
      .$returningId()

    const [created] = await tx
      .select()
      .from(members)
      .where(eq(members.id, inserted.id))
      .limit(1)

    if (!created) {
      throw new Error(`Failed to retrieve newly created member ${inserted.id}`)
    }

    await tx.insert(loginTokens).values({
      memberId: created.id,
      tokenHash,
    })

    await writeAudit(tx, {
      actorId: created.id,
      action: 'member.request_access',
      entity: 'member',
      entityId: String(created.id),
      detail: {
        email: created.email ?? created.name,
        role: created.role,
        status: created.status,
      },
    })

    return { member: created }
  })

  const baseUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const magicLinkUrl = `${baseUrl}/login/${inviteToken}`
  await sendMagicLinkEmail(trimmedEmail, magicLinkUrl)

  return ok({ memberId: member.id, inviteToken, member })
}

export const requestMagicLink = requestMemberAccess

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
    actorId: number
    memberId: number
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
    } else {
      const trimmed = patch.email.trim()
      if (!isValidEmail(trimmed)) {
        return err('INVALID_EMAIL')
      }
      normalizedEmail = trimmed.toLowerCase()
    }
  }

  return await db.transaction(async (tx) => {
    // Global lock order: member rows ascending by id
    const ids = Array.from(new Set([actorId, memberId])).sort((a, b) => a - b)

    const lockedMembers = await tx
      .select()
      .from(members)
      .where(inArray(members.id, ids))
      .for('update')
      .orderBy(asc(members.id))

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

    // The email column is the login identity: it may stay empty for legacy
    // members, but an existing email can never be cleared by a profile edit.
    if (normalizedEmail === null && target.email !== null) {
      return err('INVALID_EMAIL')
    }

    if (normalizedEmail !== undefined && normalizedEmail !== null) {
      const [existing] = await tx
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            or(eq(members.email, normalizedEmail), eq(members.name, normalizedEmail)),
            ne(members.id, memberId)
          )
        )
        .limit(1)

      if (existing) {
        return err('EMAIL_TAKEN')
      }
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

    await tx.update(members).set(updates).where(eq(members.id, memberId))

    await writeAudit(tx, {
      actorId,
      action: 'member.profile_update',
      entity: 'member',
      entityId: String(memberId),
      detail: { fields: changedFields },
      createdAt: now,
    })

    const [updated] = await tx
      .select()
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1)

    return ok(updated!)
  })
}

