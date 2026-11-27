import { and, eq, lt, ne, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { bagDuties, matches } from '@/db/schema'

export type BagDuty = typeof bagDuties.$inferSelect

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
