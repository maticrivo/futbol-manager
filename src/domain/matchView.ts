import { and, eq, getTableColumns, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import type { Db } from '@/db'
import { entries, matches, members } from '@/db/schema'
import type { Entry, EntryView } from './entries'
import type { Match } from './matches'

export type MatchPhase = 'before' | 'open' | 'guest' | 'locked' | 'played' | 'cancelled'
export type MatchRosterEntry = EntryView & { hostName: string | null }

export type MatchView = {
  match: Match
  phase: MatchPhase
  spotsLeft: number
  roster: MatchRosterEntry[]
  queue: MatchRosterEntry[]
  queuePosition: number | null
  myEntry: Entry | null
  myQueueEntry: Entry | null
  myOffer: Entry | null
}

function phaseAt(match: Match, now: Date): MatchPhase {
  if (match.status === 'cancelled') return 'cancelled'
  if (match.status === 'played') return 'played'
  if (match.status === 'locked' || now >= match.lockAt) return 'locked'
  if (now >= match.guestPhaseAt) return 'guest'
  if (now >= match.signupOpensAt) return 'open'
  return 'before'
}

const hosts = alias(members, 'hosts')

export async function getMatchView(
  db: Db,
  { matchId, memberId, now }: { matchId: number; memberId: number; now: Date },
): Promise<MatchView> {
  const rows = await db.select({
    match: getTableColumns(matches),
    entry: getTableColumns(entries),
    memberName: members.name,
    hostName: hosts.name,
  }).from(matches)
    .leftJoin(entries, and(eq(entries.matchId, matches.id), inArray(entries.status, ['confirmed', 'queued', 'offered'])))
    .leftJoin(members, eq(entries.memberId, members.id))
    .leftJoin(hosts, eq(entries.hostMemberId, hosts.id))
    .where(eq(matches.id, matchId))
    .orderBy(entries.createdAt, entries.id)

  const match = rows[0]?.match
  if (!match) throw new Error(`Match ${matchId} not found`)

  const roster: MatchRosterEntry[] = []
  const queue: MatchRosterEntry[] = []
  let myEntry: Entry | null = null
  let myQueueEntry: Entry | null = null
  let myOffer: Entry | null = null
  let queuePosition: number | null = null
  let pendingOffers = 0

  for (const { entry, memberName, hostName } of rows) {
    if (!entry) continue
    const isMine = entry.kind === 'member' && entry.memberId === memberId
    if (entry.status === 'confirmed') {
      roster.push({ ...entry, memberName, hostName })
      if (isMine) myEntry = entry
    } else if (entry.status === 'queued') {
      queue.push({ ...entry, memberName, hostName })
      if (isMine) {
        myQueueEntry = entry
        queuePosition = queue.length
      }
    } else if (entry.status === 'offered') {
      pendingOffers++
      if (isMine) myOffer = entry
    }
  }

  return {
    match, phase: phaseAt(match, now), spotsLeft: Math.max(0, match.capacity - roster.length - pendingOffers),
    roster, queue, queuePosition, myEntry, myQueueEntry, myOffer,
  }
}
