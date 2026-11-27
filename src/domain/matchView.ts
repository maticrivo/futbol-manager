import { and, eq, getTableColumns, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '@/db'
import { bagDuties, entries, matches, users } from '@/db/schema'
import type { Entry, EntryView } from './entries'
import type { Match } from './matches'
import { phaseAt, type MatchPhase } from './phase'
import { responseOf, type MatchResponse } from './responses'

// Phase lives in its own module so `responses` can use it without importing this one.
export { phaseAt, type MatchPhase } from './phase'

export type MatchRosterEntry = EntryView & { hostName: string | null }
export type BagPerson = { memberId: string; name: string | null; nickname: string | null }
export type BagDutyView = { assigned: BagPerson; backup: BagPerson | null; actual: BagPerson | null }

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
  myResponse: MatchResponse
  bagDuty: BagDutyView | null
}

const hosts = alias(users, 'hosts')
const bagAssigned = alias(users, 'bag_assigned')
const bagBackup = alias(users, 'bag_backup')
const bagActual = alias(users, 'bag_actual')

export async function getMatchView(
  db: Db,
  { matchId, memberId, now }: { matchId: number; memberId: string; now: Date },
): Promise<MatchView> {
  const rows = await db.select({
    match: getTableColumns(matches),
    entry: getTableColumns(entries),
    memberName: users.name,
    memberNickname: users.nickname,
    memberImage: users.image,
    hostName: hosts.name,
  }).from(matches)
    .leftJoin(entries, and(eq(entries.matchId, matches.id), inArray(entries.status, ['confirmed', 'queued', 'offered'])))
    .leftJoin(users, eq(entries.memberId, users.id))
    .leftJoin(hosts, eq(entries.hostMemberId, hosts.id))
    .where(eq(matches.id, matchId))
    .orderBy(entries.createdAt, entries.id)

  const match = rows[0]?.match
  if (!match) throw new Error(`Match ${matchId} not found`)

  // The roster query skips inactive rows, so read the viewer's own answer separately.
  const [mine] = await db.select({ status: entries.status }).from(entries)
    .where(and(eq(entries.matchId, matchId), eq(entries.memberId, memberId)))

  const [duty] = await db.select({
    assignedMemberId: bagDuties.assignedMemberId,
    assignedName: bagAssigned.name,
    assignedNickname: bagAssigned.nickname,
    backupMemberId: bagDuties.backupMemberId,
    backupName: bagBackup.name,
    backupNickname: bagBackup.nickname,
    actualMemberId: bagDuties.actualMemberId,
    actualName: bagActual.name,
    actualNickname: bagActual.nickname,
  }).from(bagDuties)
    .leftJoin(bagAssigned, eq(bagDuties.assignedMemberId, bagAssigned.id))
    .leftJoin(bagBackup, eq(bagDuties.backupMemberId, bagBackup.id))
    .leftJoin(bagActual, eq(bagDuties.actualMemberId, bagActual.id))
    .where(eq(bagDuties.matchId, matchId))

  const bagDuty: BagDutyView | null = duty ? {
    assigned: { memberId: duty.assignedMemberId, name: duty.assignedName, nickname: duty.assignedNickname },
    backup: duty.backupMemberId
      ? { memberId: duty.backupMemberId, name: duty.backupName, nickname: duty.backupNickname }
      : null,
    actual: duty.actualMemberId
      ? { memberId: duty.actualMemberId, name: duty.actualName, nickname: duty.actualNickname }
      : null,
  } : null

  const roster: MatchRosterEntry[] = []
  const queue: MatchRosterEntry[] = []
  let myEntry: Entry | null = null
  let myQueueEntry: Entry | null = null
  let myOffer: Entry | null = null
  let queuePosition: number | null = null
  let pendingOffers = 0

  for (const { entry, memberName, memberNickname, memberImage, hostName } of rows) {
    if (!entry) continue
    const isMine = entry.kind === 'member' && entry.memberId === memberId
    if (entry.status === 'confirmed') {
      roster.push({ ...entry, memberName, memberNickname, memberImage, hostName })
      if (isMine) myEntry = entry
    } else if (entry.status === 'queued') {
      queue.push({ ...entry, memberName, memberNickname, memberImage, hostName })
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
    roster, queue, queuePosition, myEntry, myQueueEntry, myOffer, myResponse: responseOf(mine?.status ?? null), bagDuty,
  }
}
