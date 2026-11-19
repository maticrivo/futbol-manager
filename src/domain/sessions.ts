import type { Db, Executor } from '@/db'
import { members, sessions } from '@/db/schema'
import { hashToken } from '@/lib/tokens'
import { and, eq, gt, ne } from 'drizzle-orm'
import type { Member } from './members'

export const SESSION_LIFETIME_DAYS = 365
export const SESSION_LIFETIME_MS = SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000

export async function getSessionMember(
  db: Db,
  rawSessionToken: string,
  now: Date
): Promise<Member | null> {
  const tokenHash = hashToken(rawSessionToken)

  const [row] = await db
    .select({
      member: members,
    })
    .from(sessions)
    .innerJoin(members, eq(sessions.memberId, members.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, now),
        ne(members.status, 'disabled')
      )
    )
    .limit(1)

  return row?.member ?? null
}

export async function revokeSessions(db: Executor, memberId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.memberId, memberId))
}
