import { and, eq, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { bagDuties, entries, matches } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { writeAudit } from './audit'
import { lockAdminActor } from './charges'

export type BagDuty = typeof bagDuties.$inferSelect

export type BagDrawResult =
  | { duty: BagDuty; created: boolean }
  | { duty: null; created: false }

export async function getBagCredits(
  db: Db,
  input: { now: Date; memberIds: readonly string[] },
): Promise<Map<string, Date | null>> {
  const rows = await db
    .select({
      kickoffAt: matches.kickoffAt,
      creditedMemberId: sql<string>`coalesce(${bagDuties.actualMemberId}, ${bagDuties.assignedMemberId})`,
    })
    .from(bagDuties)
    .innerJoin(matches, eq(matches.id, bagDuties.matchId))
    .where(and(
      ne(matches.status, 'cancelled'),
      lt(matches.kickoffAt, input.now),
      // A late-drawn row credits nobody until an admin marks who really took it.
      or(isNotNull(bagDuties.actualMemberId), lte(bagDuties.assignedAt, matches.kickoffAt)),
    ))

  const credits = new Map<string, Date | null>(input.memberIds.map(id => [id, null]))
  for (const row of rows) {
    if (!credits.has(row.creditedMemberId)) continue
    const current = credits.get(row.creditedMemberId)
    if (!current || row.kickoffAt > current) {
      credits.set(row.creditedMemberId, row.kickoffAt)
    }
  }
  return credits
}

/** Picks from the least-recently-credited tier; never-credited members come first. */
function pickMember(
  candidates: readonly string[],
  credits: Map<string, Date | null>,
  random: () => number,
): string {
  const never = candidates.filter(id => credits.get(id) == null)
  let tier: readonly string[] = never
  if (never.length === 0) {
    let oldest = Infinity
    for (const id of candidates) {
      oldest = Math.min(oldest, credits.get(id)!.getTime())
    }
    tier = candidates.filter(id => credits.get(id)!.getTime() === oldest)
  }
  const index = Math.min(tier.length - 1, Math.floor(random() * tier.length))
  return tier[index]
}

export async function ensureBagDuty(
  db: Db,
  input: { matchId: number; now: Date; random?: () => number },
): Promise<BagDrawResult> {
  const { matchId, now, random = Math.random } = input

  // One row per match: once it exists there is nothing to draw, and callers
  // (ticks and page loads) avoid rescanning the credit history.
  const [existing] = await db.select().from(bagDuties).where(eq(bagDuties.matchId, matchId))
  if (existing) return { duty: existing, created: false }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId))
  if (!match) return { duty: null, created: false }
  if (match.status === 'cancelled' || match.status === 'played') return { duty: null, created: false }

  // The draw window is [kickoff - 1h, kickoff): a tick that first sees the match
  // at or after kickoff must not fabricate a late assignment.
  const drawAt = match.kickoffAt.getTime() - 60 * 60_000
  if (now.getTime() < drawAt) return { duty: null, created: false }
  if (now.getTime() >= match.kickoffAt.getTime()) return { duty: null, created: false }

  const rows = await db
    .select({ memberId: entries.memberId })
    .from(entries)
    .where(and(
      eq(entries.matchId, matchId),
      eq(entries.status, 'confirmed'),
      eq(entries.kind, 'member'),
      isNotNull(entries.memberId),
    ))
  const eligible = rows.map(row => row.memberId!)
  if (eligible.length === 0) return { duty: null, created: false }

  const credits = await getBagCredits(db, { now, memberIds: eligible })
  const assignedMemberId = pickMember(eligible, credits, random)
  const backupCandidates = eligible.filter(id => id !== assignedMemberId)
  const backupMemberId = backupCandidates.length ? pickMember(backupCandidates, credits, random) : null

  const [inserted] = await db
    .insert(bagDuties)
    .values({ matchId, assignedMemberId, backupMemberId, assignedAt: now })
    .onConflictDoNothing({ target: bagDuties.matchId })
    .returning()
  if (inserted) return { duty: inserted, created: true }

  const [raced] = await db.select().from(bagDuties).where(eq(bagDuties.matchId, matchId))
  return raced ? { duty: raced, created: false } : { duty: null, created: false }
}

export async function recordBagTaker(
  db: Db,
  input: { actorId: string; matchId: number; memberId: string | null; now: Date },
): Promise<Result<BagDuty, 'FORBIDDEN' | 'NOT_FOUND' | 'TOO_EARLY' | 'NOT_IN_ROSTER' | 'MATCH_CANCELLED'>> {
  const { actorId, matchId, memberId, now } = input

  return db.transaction(async tx => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for('update')
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    if (!match) return err('NOT_FOUND')
    if (match.status === 'cancelled') return err('MATCH_CANCELLED')
    if (now.getTime() < match.kickoffAt.getTime()) return err('TOO_EARLY')

    const [duty] = await tx.select().from(bagDuties).where(eq(bagDuties.matchId, matchId)).for('update')

    if (memberId !== null) {
      const [entry] = await tx.select({ id: entries.id }).from(entries).where(and(
        eq(entries.matchId, matchId),
        eq(entries.status, 'confirmed'),
        eq(entries.kind, 'member'),
        eq(entries.memberId, memberId),
      ))
      if (!entry) return err('NOT_IN_ROSTER')
    }

    // The draw window can be missed (late tick, late schedule). Recording the
    // taker then creates the row so the week still counts for fairness.
    if (!duty) {
      if (memberId === null) return err('NOT_FOUND')
      const [created] = await tx.insert(bagDuties).values({
        matchId,
        assignedMemberId: memberId,
        actualMemberId: memberId,
        assignedAt: now,
        recordedBy: actorId,
        recordedAt: now,
      }).returning()

      await writeAudit(tx, {
        actorId,
        action: 'bag.record',
        entity: 'bag_duty',
        entityId: String(created.id),
        detail: { previous: null, actual: memberId },
        createdAt: now,
      })

      return ok(created)
    }

    const [updated] = await tx.update(bagDuties)
      .set({ actualMemberId: memberId, recordedBy: actorId, recordedAt: now, updatedAt: now })
      .where(eq(bagDuties.id, duty.id))
      .returning()

    await writeAudit(tx, {
      actorId,
      action: 'bag.record',
      entity: 'bag_duty',
      entityId: String(duty.id),
      detail: { previous: duty.actualMemberId, actual: memberId },
      createdAt: now,
    })

    return ok(updated)
  })
}
