import { and, eq, lte } from 'drizzle-orm'
import type { Db, Executor, Tx } from '@/db'
import { entries } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { isLocked, lockMatch, lockMatchForEntry, remainingSpots, type Entry } from './entries'
import { getSettings } from './matches'

type QueueInput = { memberId: string; matchId: number; now: Date }

function memberEntries(tx: Tx, matchId: number, memberId: string) {
  return tx.select().from(entries)
    .where(and(eq(entries.matchId, matchId), eq(entries.memberId, memberId)))
    .for('update')
}

export async function joinQueue(
  db: Db,
  { memberId, matchId, now }: QueueInput,
): Promise<Result<Entry, 'SPOT_AVAILABLE' | 'MATCH_LOCKED' | 'ALREADY_IN_MATCH' | 'ALREADY_QUEUED' | 'MATCH_CANCELLED'>> {
  return db.transaction(async tx => {
    const match = await lockMatch(tx, matchId)
    if (match?.status === 'cancelled') return err('MATCH_CANCELLED')
    if (!match || isLocked(match, now)) return err('MATCH_LOCKED')

    const [existing] = await memberEntries(tx, matchId, memberId)
    if (existing?.status === 'confirmed') return err('ALREADY_IN_MATCH')
    if (existing?.status === 'queued' || existing?.status === 'offered') return err('ALREADY_QUEUED')
    if (await remainingSpots(tx, match) !== 0) return err('SPOT_AVAILABLE')

    // A rejoin takes a new place in line, not the row's original position.
    const queued = { status: 'queued', createdAt: now, updatedAt: now, offeredAt: null, offerExpiresAt: null } as const
    if (existing) {
      await tx.update(entries).set(queued).where(eq(entries.id, existing.id))
      return ok({ ...existing, ...queued })
    }

    await tx.insert(entries).values({ matchId, memberId, kind: 'member', ...queued })
    const [entry] = await memberEntries(tx, matchId, memberId)
    return ok(entry)
  })
}

export async function leaveQueue(
  db: Db,
  { memberId, matchId, now }: QueueInput,
): Promise<Result<Entry, 'NOT_QUEUED' | 'MATCH_LOCKED'>> {
  return db.transaction(async tx => {
    const match = await lockMatch(tx, matchId)
    if (!match) return err('NOT_QUEUED')
    const [entry] = await memberEntries(tx, matchId, memberId)
    if (entry?.status !== 'queued') return err('NOT_QUEUED')
    if (isLocked(match, now)) return err('MATCH_LOCKED')

    const withdrawn = { status: 'withdrawn', updatedAt: now } as const
    await tx.update(entries).set(withdrawn).where(eq(entries.id, entry.id))
    return ok({ ...entry, ...withdrawn })
  })
}

// Pass the caller's transaction when freeing and reserving a spot together.
export async function offerNext(db: Db, matchId: number, now: Date, executor?: Executor): Promise<Entry | null> {
  const promote = async (tx: Executor): Promise<Entry | null> => {
    const match = await lockMatch(tx, matchId)
    if (!match || isLocked(match, now)) return null
    const free = await remainingSpots(tx, match)
    if (free <= 0) return null

    const { queueWindowMinutes } = await getSettings(tx)
    const offer = {
      status: 'offered',
      offeredAt: now,
      offerExpiresAt: new Date(now.getTime() + queueWindowMinutes * 60_000),
      updatedAt: now,
    } as const

    let first: Entry | null = null
    for (let spot = 0; spot < free; spot++) {
      const [next] = await tx.select().from(entries)
        .where(and(eq(entries.matchId, matchId), eq(entries.status, 'queued')))
        .orderBy(entries.createdAt, entries.id)
        .limit(1).for('update')
      if (!next) break

      await tx.update(entries).set(offer).where(eq(entries.id, next.id))
      first ??= { ...next, ...offer }
    }
    return first
  }
  return executor ? promote(executor) : db.transaction(promote)
}

export async function expireOffers(
  db: Db,
  matchId: number,
  now: Date,
): Promise<{ expired: number; offered: Entry | null }> {
  return db.transaction(async tx => {
    if (!await lockMatch(tx, matchId)) return { expired: 0, offered: null }
    const result = await tx.update(entries).set({ status: 'withdrawn', updatedAt: now })
      .where(and(eq(entries.matchId, matchId), eq(entries.status, 'offered'), lte(entries.offerExpiresAt, now)))
    const offered = await offerNext(db, matchId, now, tx)
    return { expired: result.rowCount ?? 0, offered }
  })
}

export async function claimOffer(
  db: Db,
  { entryId, memberId, now }: { entryId: number; memberId: string; now: Date },
): Promise<Result<Entry, 'NOT_FOUND' | 'NOT_OWNER' | 'NOT_OFFERED' | 'OFFER_EXPIRED' | 'FULL' | 'MATCH_LOCKED'>> {
  return db.transaction(async tx => {
    const match = await lockMatchForEntry(tx, entryId)
    if (!match) return err('NOT_FOUND')
    const [entry] = await tx.select().from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.matchId, match.id))).for('update')
    if (!entry) return err('NOT_FOUND')
    if (entry.memberId !== memberId) return err('NOT_OWNER')
    if (entry.status !== 'offered') return err('NOT_OFFERED')
    if (!entry.offerExpiresAt || entry.offerExpiresAt <= now) return err('OFFER_EXPIRED')
    if (isLocked(match, now)) return err('MATCH_LOCKED')

    const confirmed = await tx.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.matchId, match.id), eq(entries.status, 'confirmed')))
      .for('update')
    if (confirmed.length >= match.capacity) return err('FULL')

    const claimed = { status: 'confirmed', offeredAt: null, offerExpiresAt: null, updatedAt: now } as const
    await tx.update(entries).set(claimed).where(eq(entries.id, entryId))
    return ok({ ...entry, ...claimed })
  })
}
