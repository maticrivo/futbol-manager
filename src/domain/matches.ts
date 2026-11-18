import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { Db } from '@/db'
import { matches } from '@/db/schema'
import { TZ, weekSchedule } from '@/lib/time'
import { getSettings, updateSettings, type Settings } from './settings'

export type Match = typeof matches.$inferSelect
export { getSettings, updateSettings, type Settings }

export async function getMatch(db: Db, matchId: number): Promise<Match | null> {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId))
  return match ?? null
}

async function getMatchByDate(db: Db, matchDate: string): Promise<Match | null> {
  const [match] = await db.select().from(matches).where(eq(matches.matchDate, matchDate))
  return match ?? null
}

export async function createMatchForDate(db: Db, matchDate: string): Promise<Match> {
  const existing = await getMatchByDate(db, matchDate)
  if (existing) {
    return existing
  }

  const currentSettings = await getSettings(db)
  const schedule = weekSchedule(matchDate, currentSettings.kickoffTime)

  try {
    const [inserted] = await db
      .insert(matches)
      .values({
        matchDate,
        kickoffAt: schedule.kickoffAt,
        signupOpensAt: schedule.signupOpensAt,
        guestPhaseAt: schedule.guestPhaseAt,
        lockAt: schedule.lockAt,
        venue: currentSettings.venue,
        costAgorot: currentSettings.costAgorot,
        capacity: currentSettings.capacity,
        status: 'scheduled',
      })
      .$returningId()

    const created = await getMatch(db, inserted.id)
    if (!created) {
      throw new Error(`Failed to retrieve newly created match for ${matchDate}`)
    }
    return created
  } catch (err: unknown) {
    const isDup =
      typeof err === 'object' &&
      err !== null &&
      (('code' in err && (err as { code: string }).code === 'ER_DUP_ENTRY') ||
        ('errno' in err && (err as { errno: number }).errno === 1062))

    if (isDup) {
      const match = await getMatchByDate(db, matchDate)
      if (match) return match
    }
    throw err
  }
}

export async function createNextMatch(db: Db, fromMatchId: number): Promise<Match | null> {
  const sourceMatch = await getMatch(db, fromMatchId)
  if (!sourceMatch) {
    return null
  }

  const nextDate = DateTime.fromISO(sourceMatch.matchDate, { zone: TZ })
    .plus({ days: 7 })
    .toISODate()

  if (!nextDate) {
    return null
  }

  const existing = await getMatchByDate(db, nextDate)
  if (existing) {
    return null
  }

  return createMatchForDate(db, nextDate)
}

export async function getUpcomingMatch(db: Db, now: Date): Promise<Match | null> {
  const threshold = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  const [match] = await db
    .select()
    .from(matches)
    .where(
      and(
        inArray(matches.status, ['scheduled', 'locked']),
        gte(matches.kickoffAt, threshold)
      )
    )
    .orderBy(asc(matches.kickoffAt))
    .limit(1)

  return match ?? null
}
