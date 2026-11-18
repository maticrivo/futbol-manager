import { asc, DrizzleQueryError, eq, inArray } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { Db } from '@/db'
import { matches } from '@/db/schema'
import type { PushTransport } from '@/lib/push'
import { TZ } from '@/lib/time'
import { advanceMatch, lockMatch } from './lock'
import { createMatchForDate, createNextMatch } from './matches'
import { processDueNotifications } from './notifications'
import { expireOffers } from './queue'

export type TickCounts = {
  locked: number
  matchesCreated: number
  expiredOffers: number
  notificationsSent: number
}

function isDuplicateMatch(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (('code' in cause && (cause as { code?: string }).code === 'ER_DUP_ENTRY') ||
      ('errno' in cause && (cause as { errno?: number }).errno === 1062))
  )
}

/**
 * Runs one scheduler pass. Idempotent: a second pass at the same instant creates
 * no additional charges, matches or notifications.
 */
export async function runTick(db: Db, now: Date, transport: PushTransport): Promise<TickCounts> {
  let locked = 0
  let matchesCreated = 0
  let expiredOffers = 0

  const active = await db
    .select()
    .from(matches)
    .where(inArray(matches.status, ['scheduled', 'locked']))
    .orderBy(asc(matches.kickoffAt))

  // Self-heal: when no active week exists at all, schedule the next Tuesday
  // strictly after `now` (never recreating a cancelled week).
  if (active.length === 0) {
    const local = DateTime.fromJSDate(now, { zone: TZ })
    const days = ((2 - local.weekday + 7) % 7) || 7
    const nextTuesday = local.plus({ days }).toISODate()
    if (nextTuesday) {
      const [existing] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.matchDate, nextTuesday))
      if (!existing) {
        await createMatchForDate(db, nextTuesday)
        matchesCreated++
      }
    }
  }

  for (const match of active) {
    if (match.status === 'scheduled' && now >= match.lockAt) {
      const result = await lockMatch(db, match.id, now)
      // Count a lock only when this tick performed the transition. lockMatch
      // reports the number of charges it created; a tick that lost a concurrent
      // race to lock the same match reports zero charges and must not count it.
      if (result.ok && result.value.chargesCreated > 0) locked++
    } else if (match.status === 'scheduled') {
      const expired = await expireOffers(db, match.id, now)
      expiredOffers += expired.expired
    }

    await advanceMatch(db, match.id, now)

    // Repair: a match that ended up locked — whether just locked here or already
    // locked before this tick (e.g. by a page-triggered advance) — needs its
    // successor week. createNextMatch is idempotent and never recreates a week.
    const [after] = await db
      .select({ status: matches.status })
      .from(matches)
      .where(eq(matches.id, match.id))
    if (after?.status === 'locked') {
      // A concurrent tick may create the same successor week; treat that race as
      // "someone else already created it" rather than failing the tick.
      const next = await createNextMatch(db, match.id).catch((error: unknown) => {
        if (isDuplicateMatch(error)) return null
        throw error
      })
      if (next) matchesCreated++
    }
  }

  const { sent } = await processDueNotifications(db, now, transport)
  return { locked, matchesCreated, expiredOffers, notificationsSent: sent }
}
