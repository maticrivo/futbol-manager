import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm'
import type { Db } from '@/db'
import { entries, matches, users } from '@/db/schema'
import type { Entry } from './entries'
import { memberNameOrder, toMember, type Member } from './members'
import { phaseAt } from './phase'

/** A member's answer for one match ("voy" / "no voy" / not yet). */
export type MatchResponse = 'going' | 'not_going' | 'unanswered'

const RESPONSE_BY_STATUS: Record<Entry['status'], MatchResponse> = {
  confirmed: 'going',
  queued: 'going',
  offered: 'going',
  declined: 'not_going',
  // Left without saying no: a withdrawal, leaving the queue, a lapsed offer,
  // or an admin removal. These members still owe an answer.
  withdrawn: 'unanswered',
  expired: 'unanswered',
  removed: 'unanswered',
}

export function responseOf(status: Entry['status'] | null): MatchResponse {
  return status === null ? 'unanswered' : RESPONSE_BY_STATUS[status]
}

export const ANSWERED_STATUSES = entries.status.enumValues
  .filter(status => responseOf(status) !== 'unanswered')

/**
 * Who may see the members who have not answered yet: everyone, as agreed for the group.
 * The single place to narrow it again (it was admins only at first).
 */
export function canSeeUnanswered(viewer: { role: Member['role'] }): boolean {
  return viewer.role === 'admin' || viewer.role === 'member'
}

export type ResponseMember = { id: string; name: string; nickname: string | null; image: string | null }

export type MatchResponses = {
  notGoing: ResponseMember[]
  /** `null` when the viewer may not see it, or the match is not taking answers. */
  unanswered: ResponseMember[] | null
}

export async function listMatchResponses(
  db: Db,
  { matchId, viewer, now }: { matchId: number; viewer: { role: Member['role'] }; now: Date },
): Promise<MatchResponses> {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId))
  if (!match) throw new Error(`Match ${matchId} not found`)
  const phase = phaseAt(match, now)
  const showUnanswered = canSeeUnanswered(viewer) && (phase === 'open' || phase === 'guest')

  const rows = await db.select({ user: getTableColumns(users), status: entries.status })
    .from(users)
    .leftJoin(entries, and(eq(entries.memberId, users.id), eq(entries.matchId, matchId)))
    .where(eq(users.status, 'active'))
    .orderBy(memberNameOrder, asc(users.id))

  const notGoing: ResponseMember[] = []
  const unanswered: ResponseMember[] = []
  for (const { user, status } of rows) {
    const { id, name, nickname, image } = toMember(user)
    const response = responseOf(status)
    if (response === 'not_going') notGoing.push({ id, name, nickname, image })
    else if (response === 'unanswered') unanswered.push({ id, name, nickname, image })
  }
  return { notGoing, unanswered: showUnanswered ? unanswered : null }
}

/** Members who answered either way, for skipping answer-seeking reminders. */
export async function answeredMemberIds(db: Db, matchId: number): Promise<Set<string>> {
  const rows = await db.select({ memberId: entries.memberId }).from(entries)
    .where(and(eq(entries.matchId, matchId), inArray(entries.status, ANSWERED_STATUSES)))
  return new Set(rows.flatMap(({ memberId }) => memberId === null ? [] : [memberId]))
}
