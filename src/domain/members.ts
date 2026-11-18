import type { Db } from '@/db'
import { loginTokens, members, sessions } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { generateToken, hashToken } from '@/lib/tokens'
import { and, eq, isNull } from 'drizzle-orm'
import { writeAudit } from './audit'
import { revokeSessions, SESSION_LIFETIME_MS } from './sessions'

export type Member = typeof members.$inferSelect

export { revokeSessions } from './sessions'

export async function createMember(
  db: Db,
  input: { name: string; role?: 'member' | 'admin'; locale?: string }
): Promise<{ member: Member; inviteToken: string }> {
  const inviteToken = generateToken()
  const tokenHash = hashToken(inviteToken)

  return await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(members)
      .values({
        name: input.name,
        role: input.role ?? 'member',
        locale: input.locale ?? 'en',
        status: 'active',
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
  const [actor] = await db
    .select()
    .from(members)
    .where(eq(members.id, actorId))
    .limit(1)

  if (!actor || actor.role !== 'admin') {
    return err('FORBIDDEN')
  }

  const [target] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)

  if (!target) {
    return err('NOT_FOUND')
  }

  const inviteToken = generateToken()
  const tokenHash = hashToken(inviteToken)

  await db.transaction(async (tx) => {
    await tx
      .update(loginTokens)
      .set({ revokedAt: now })
      .where(and(eq(loginTokens.memberId, memberId), isNull(loginTokens.revokedAt)))

    await revokeSessions(tx, memberId)

    await tx.insert(loginTokens).values({
      memberId,
      tokenHash,
    })

    await writeAudit(tx, {
      actorId,
      action: 'member.regenerate_invite',
      entity: 'member',
      entityId: String(memberId),
    })
  })

  return ok({ inviteToken })
}

export async function loginWithInvite(
  db: Db,
  rawToken: string,
  now: Date
): Promise<Result<{ member: Member; sessionToken: string }, 'INVALID_TOKEN' | 'DISABLED'>> {
  const tokenHash = hashToken(rawToken)

  const [row] = await db
    .select({
      token: loginTokens,
      member: members,
    })
    .from(loginTokens)
    .innerJoin(members, eq(loginTokens.memberId, members.id))
    .where(and(eq(loginTokens.tokenHash, tokenHash), isNull(loginTokens.revokedAt)))
    .limit(1)

  if (!row) {
    return err('INVALID_TOKEN')
  }

  if (row.member.status !== 'active') {
    return err('DISABLED')
  }

  const sessionToken = generateToken()
  const sessionTokenHash = hashToken(sessionToken)
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS)

  await db.transaction(async (tx) => {
    await tx
      .update(loginTokens)
      .set({ lastUsedAt: now })
      .where(eq(loginTokens.id, row.token.id))

    await tx.insert(sessions).values({
      memberId: row.member.id,
      tokenHash: sessionTokenHash,
      expiresAt,
    })

    await writeAudit(tx, {
      actorId: row.member.id,
      action: 'auth.login',
      entity: 'member',
      entityId: String(row.member.id),
    })
  })

  return ok({ member: row.member, sessionToken })
}

export async function setMemberStatus(
  db: Db,
  actorId: number,
  memberId: number,
  status: 'active' | 'disabled'
): Promise<Result<Member, 'FORBIDDEN' | 'NOT_FOUND'>> {
  const [actor] = await db
    .select()
    .from(members)
    .where(eq(members.id, actorId))
    .limit(1)

  if (!actor || actor.role !== 'admin') {
    return err('FORBIDDEN')
  }

  const [target] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)

  if (!target) {
    return err('NOT_FOUND')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ status })
      .where(eq(members.id, memberId))

    await writeAudit(tx, {
      actorId,
      action: 'member.status',
      entity: 'member',
      entityId: String(memberId),
      detail: { status },
    })
  })

  const [updated] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)

  return ok(updated!)
}
