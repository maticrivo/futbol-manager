import { and, count, eq, inArray } from 'drizzle-orm'
import type { Db, Executor, Tx } from '@/db'
import { entries, matches } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import type { Match } from './matches'

export type Entry = typeof entries.$inferSelect
export type EntryView = Entry & { memberName: string | null; memberNickname: string | null; memberImage: string | null }

async function countByStatus(db: Db, matchId: number, status: Entry['status']): Promise<number> {
  const [row] = await db.select({ total: count() }).from(entries)
    .where(and(eq(entries.matchId, matchId), eq(entries.status, status)))
  return Number(row.total)
}

export function confirmedCount(db: Db, matchId: number): Promise<number> {
  return countByStatus(db, matchId, 'confirmed')
}

export function pendingOfferCount(db: Db, matchId: number): Promise<number> {
  return countByStatus(db, matchId, 'offered')
}

export async function remainingSpots(executor: Executor, match: Match): Promise<number> {
  // A locking read sees commits made while this transaction waited for the match.
  const rows = await executor.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.matchId, match.id), inArray(entries.status, ['confirmed', 'offered'])))
    .for('update')
  return Math.max(0, match.capacity - rows.length)
}

export async function freeSpots(db: Db, matchId: number, executor?: Executor): Promise<number> {
  if (executor) {
    const match = await lockMatch(executor, matchId)
    return match ? remainingSpots(executor, match) : 0
  }

  const [roster] = await db.select({ capacity: matches.capacity, occupied: count(entries.id) })
    .from(matches)
    .leftJoin(entries, and(eq(entries.matchId, matches.id), inArray(entries.status, ['confirmed', 'offered'])))
    .where(eq(matches.id, matchId))
    .groupBy(matches.id, matches.capacity)
  return roster ? Math.max(0, roster.capacity - Number(roster.occupied)) : 0
}

export async function lockMatch(executor: Executor, matchId: number): Promise<Match | undefined> {
  const [match] = await executor.select().from(matches).where(eq(matches.id, matchId)).for('update')
  return match
}

export async function lockMatchForEntry(tx: Tx, entryId: number): Promise<Match | undefined> {
  // The scalar lookup only locates the parent; FOR UPDATE locks the match,
  // not the subquery's entry. Read the entry itself after taking that lock.
  const matchId = tx.select({ matchId: entries.matchId }).from(entries).where(eq(entries.id, entryId))
  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for('update')
  return match
}

async function readEntry(tx: Tx, entryId: number): Promise<Entry> {
  const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId)).for('update')
  if (!entry) throw new Error(`Failed to retrieve entry ${entryId}`)
  return entry
}

export function isLocked(match: Match, now: Date): boolean {
  return match.status !== 'scheduled' || now >= match.lockAt
}

export async function signup(
  db: Db,
  { memberId, matchId, now }: { memberId: string; matchId: number; now: Date },
): Promise<Result<Entry, 'MATCH_LOCKED' | 'NOT_OPEN' | 'FULL' | 'ALREADY_SIGNED_UP' | 'MATCH_CANCELLED'>> {
  return db.transaction(async tx => {
    const match = await lockMatch(tx, matchId)
    if (match?.status === 'cancelled') return err('MATCH_CANCELLED')
    if (!match || isLocked(match, now)) return err('MATCH_LOCKED')
    if (now < match.signupOpensAt) return err('NOT_OPEN')

    const [existing] = await tx.select().from(entries)
      .where(and(eq(entries.matchId, match.id), eq(entries.memberId, memberId))).for('update')
    if (existing && ['confirmed', 'queued', 'offered'].includes(existing.status)) {
      return err('ALREADY_SIGNED_UP')
    }
    if (await remainingSpots(tx, match) <= 0) return err('FULL')

    if (existing) {
      await tx.update(entries)
        .set({ status: 'confirmed', offeredAt: null, offerExpiresAt: null, updatedAt: now })
        .where(eq(entries.id, existing.id))
      return ok(await readEntry(tx, existing.id))
    }

    const [inserted] = await tx.insert(entries)
      .values({ matchId, memberId, kind: 'member', status: 'confirmed', createdAt: now, updatedAt: now })
      .returning({ id: entries.id })
    return ok(await readEntry(tx, inserted.id))
  })
}

export async function withdraw(
  db: Db,
  { entryId, actorMemberId, now }: { entryId: number; actorMemberId: string; now: Date },
): Promise<Result<Entry, 'NOT_FOUND' | 'NOT_OWNER' | 'LOCKED' | 'NOT_WITHDRAWABLE'>> {
  return db.transaction(async tx => {
    const match = await lockMatchForEntry(tx, entryId)
    if (!match) return err('NOT_FOUND')
    const [entry] = await tx.select().from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.matchId, match.id))).for('update')
    if (!entry) return err('NOT_FOUND')
    if (entry.memberId !== actorMemberId) return err('NOT_OWNER')
    if (entry.status !== 'confirmed') return err('NOT_WITHDRAWABLE')
    if (isLocked(match, now)) return err('LOCKED')

    await tx.update(entries).set({ status: 'withdrawn', updatedAt: now }).where(eq(entries.id, entryId))
    const { offerNext } = await import('./queue')
    await offerNext(db, match.id, now, tx)
    return ok(await readEntry(tx, entryId))
  })
}

export async function addGuest(
  db: Db,
  { hostMemberId, matchId, name, now }: { hostMemberId: string; matchId: number; name: string; now: Date },
): Promise<Result<Entry, 'GUEST_PHASE_CLOSED' | 'FULL' | 'MATCH_LOCKED' | 'INVALID_NAME' | 'MATCH_CANCELLED'>> {
  return db.transaction(async tx => {
    const match = await lockMatch(tx, matchId)
    if (match?.status === 'cancelled') return err('MATCH_CANCELLED')
    if (!match || isLocked(match, now)) return err('MATCH_LOCKED')
    if (now < match.guestPhaseAt) return err('GUEST_PHASE_CLOSED')
    const guestName = name.trim()
    if (!guestName) return err('INVALID_NAME')
    if (await remainingSpots(tx, match) <= 0) return err('FULL')

    const [inserted] = await tx.insert(entries)
      .values({
        matchId, hostMemberId, guestName, kind: 'guest', memberId: null, status: 'confirmed',
        createdAt: now, updatedAt: now,
      })
      .returning({ id: entries.id })
    return ok(await readEntry(tx, inserted.id))
  })
}

export async function removeGuest(
  db: Db,
  { entryId, actorMemberId, asAdmin, now }: { entryId: number; actorMemberId: string; asAdmin?: boolean; now: Date },
): Promise<Result<Entry, 'NOT_FOUND' | 'NOT_OWNER' | 'LOCKED' | 'NOT_GUEST'>> {
  return db.transaction(async tx => {
    const match = await lockMatchForEntry(tx, entryId)
    if (!match) return err('NOT_FOUND')
    const [entry] = await tx.select().from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.matchId, match.id), eq(entries.status, 'confirmed'))).for('update')
    if (!entry) return err('NOT_FOUND')
    if (entry.kind !== 'guest') return err('NOT_GUEST')
    if (entry.hostMemberId !== actorMemberId && asAdmin !== true) return err('NOT_OWNER')
    if (isLocked(match, now)) return err('LOCKED')

    await tx.update(entries).set({ status: 'removed', updatedAt: now }).where(eq(entries.id, entryId))
    const { offerNext } = await import('./queue')
    await offerNext(db, match.id, now, tx)
    return ok(await readEntry(tx, entryId))
  })
}
