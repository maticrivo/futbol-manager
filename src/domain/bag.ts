import { and, eq, isNotNull, lt, ne, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { bagDuties, entries, matches } from '@/db/schema'

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
      creditedMemberId: sql<string>`coalesce(actual_member_id, assigned_member_id)`,
    })
    .from(bagDuties)
    .innerJoin(matches, eq(matches.id, bagDuties.matchId))
    .where(and(ne(matches.status, 'cancelled'), lt(matches.kickoffAt, input.now)))

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

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId))
  if (!match) return { duty: null, created: false }
  if (match.status === 'cancelled' || match.status === 'played') return { duty: null, created: false }

  const drawAt = match.kickoffAt.getTime() - 60 * 60_000
  if (now.getTime() < drawAt) return { duty: null, created: false }

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

  const [existing] = await db.select().from(bagDuties).where(eq(bagDuties.matchId, matchId))
  return existing ? { duty: existing, created: false } : { duty: null, created: false }
}
