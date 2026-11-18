import { and, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '@/db'
import { entries, matches } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { writeAudit } from './audit'
import { chargeAddedMember, createMatchCharges, isAdmin, waiveRemovedMember } from './charges'
import { lockMatch as lockMatchRow, lockMatchForEntry, remainingSpots, type Entry } from './entries'
import { getMatch, type Match } from './matches'
import { expireOffers, offerNext } from './queue'

export { waiveCharge, restoreCharge } from './charges'

export async function lockMatch(
  db: Db, matchId: number, now: Date,
): Promise<Result<{ chargesCreated: number }, 'NOT_FOUND'>> {
  return db.transaction(async tx => {
    const match = await lockMatchRow(tx, matchId)
    if (!match) return err('NOT_FOUND')
    if (match.status !== 'scheduled' || now < match.lockAt) return ok({ chargesCreated: 0 })

    await tx.update(matches).set({ status: 'locked', updatedAt: now }).where(eq(matches.id, matchId))
    await tx.update(entries).set({ status: 'expired', updatedAt: now })
      .where(and(eq(entries.matchId, matchId), inArray(entries.status, ['queued', 'offered'])))
    const confirmed = await tx.select({ memberId: entries.memberId }).from(entries)
      .where(and(eq(entries.matchId, matchId), eq(entries.status, 'confirmed'), eq(entries.kind, 'member')))
      .for('update')
    const memberIds = confirmed.flatMap(({ memberId }) => memberId === null ? [] : [memberId])
    const chargesCreated = await createMatchCharges(tx, match, memberIds, now)
    await writeAudit(tx, { action: 'match.lock', entity: 'match', entityId: String(matchId), detail: { chargesCreated } })
    return ok({ chargesCreated })
  })
}

const playedDelay = 3 * 60 * 60_000

export async function advanceMatch(db: Db, matchId: number, now: Date): Promise<void> {
  const match = await getMatch(db, matchId)
  if (!match) return

  if (match.status === 'scheduled') {
    if (now < match.lockAt) {
      await expireOffers(db, matchId, now)
      return
    }
    await lockMatch(db, matchId, now)
  } else if (match.status !== 'locked') {
    return
  }

  if (now.getTime() < match.kickoffAt.getTime() + playedDelay) return
  await db.transaction(async tx => {
    const current = await lockMatchRow(tx, matchId)
    if (current?.status === 'locked' && now.getTime() >= current.kickoffAt.getTime() + playedDelay) {
      await tx.update(matches).set({ status: 'played', updatedAt: now }).where(eq(matches.id, matchId))
    }
  })
}

function rosterEntry(tx: Tx, match: Match, entryId: number) {
  return tx.select().from(entries)
    .where(and(eq(entries.matchId, match.id), eq(entries.id, entryId))).for('update')
}

export async function adminAddEntry(
  db: Db,
  input: { actorId: number; matchId: number; memberId: number; now: Date; reason: string },
): Promise<Result<Entry, 'FORBIDDEN' | 'MATCH_CANCELLED' | 'FULL' | 'ALREADY_IN_MATCH' | 'INVALID_REASON'>> {
  const { actorId, matchId, memberId, now } = input
  if (!await isAdmin(db, actorId)) return err('FORBIDDEN')

  return db.transaction(async tx => {
    const match = await lockMatchRow(tx, matchId)
    if (!match || (match.status !== 'scheduled' && match.status !== 'locked')) return err('MATCH_CANCELLED')
    const reason = input.reason.trim()
    if (match.status === 'locked' && !reason) return err('INVALID_REASON')

    const [existing] = await tx.select().from(entries)
      .where(and(eq(entries.matchId, matchId), eq(entries.memberId, memberId))).for('update')
    if (existing && ['confirmed', 'queued', 'offered'].includes(existing.status)) return err('ALREADY_IN_MATCH')
    // Locked roster edits are admin overrides and can go over capacity.
    if (match.status === 'scheduled' && await remainingSpots(tx, match) === 0) return err('FULL')

    const confirmed = { kind: 'member', status: 'confirmed', updatedAt: now } as const
    let entryId: number
    if (existing) {
      await tx.update(entries).set({ ...confirmed, attended: null, offeredAt: null, offerExpiresAt: null })
        .where(eq(entries.id, existing.id))
      entryId = existing.id
    } else {
      const [inserted] = await tx.insert(entries).values({ ...confirmed, matchId, memberId, createdAt: now }).$returningId()
      entryId = inserted.id
    }

    if (match.status === 'locked') await chargeAddedMember(tx, match, memberId, now)
    await writeAudit(tx, { actorId, action: 'entry.admin_add', entity: 'entry', entityId: String(entryId), detail: { reason } })
    const [entry] = await rosterEntry(tx, match, entryId)
    return ok(entry)
  })
}

type EditEntry = { actorId: number; entryId: number }

export async function adminRemoveEntry(
  db: Db,
  input: EditEntry & { now: Date; reason: string },
): Promise<Result<Entry, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_CONFIRMED' | 'INVALID_REASON'>> {
  const { actorId, entryId, now } = input
  if (!await isAdmin(db, actorId)) return err('FORBIDDEN')

  return db.transaction(async tx => {
    const match = await lockMatchForEntry(tx, entryId)
    if (!match) return err('NOT_FOUND')
    const [entry] = await rosterEntry(tx, match, entryId)
    if (!entry) return err('NOT_FOUND')
    if (entry.status !== 'confirmed') return err('NOT_CONFIRMED')
    const reason = input.reason.trim()
    if (!reason) return err('INVALID_REASON')

    const removed = { status: 'removed', updatedAt: now } as const
    await tx.update(entries).set(removed).where(eq(entries.id, entryId))
    if (match.status === 'locked' && entry.kind === 'member' && entry.memberId !== null) {
      await waiveRemovedMember(tx, match.id, entry.memberId, actorId, reason, now)
    } else if (match.status === 'scheduled') {
      await offerNext(db, match.id, now, tx)
    }
    await writeAudit(tx, { actorId, action: 'entry.admin_remove', entity: 'entry', entityId: String(entryId), detail: { reason } })
    return ok({ ...entry, ...removed })
  })
}

export async function setAttendance(
  db: Db,
  { actorId, entryId, attended }: EditEntry & { attended: boolean },
): Promise<Result<Entry, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_CONFIRMED'>> {
  if (!await isAdmin(db, actorId)) return err('FORBIDDEN')

  return db.transaction(async tx => {
    const match = await lockMatchForEntry(tx, entryId)
    if (!match) return err('NOT_FOUND')
    const [entry] = await rosterEntry(tx, match, entryId)
    if (!entry) return err('NOT_FOUND')
    if (entry.status !== 'confirmed') return err('NOT_CONFIRMED')

    await tx.update(entries).set({ attended }).where(eq(entries.id, entryId))
    await writeAudit(tx, { actorId, action: 'entry.attendance', entity: 'entry', entityId: String(entryId), detail: { attended } })
    const [updated] = await rosterEntry(tx, match, entryId)
    return ok(updated)
  })
}
