import { asc, desc, DrizzleQueryError, eq, inArray } from 'drizzle-orm'
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

  // Self-heal: recover the schedule when no active week exists. With no matches at
  // all, schedule the next Tuesday strictly after `now`. With matches but none
  // active, cascade forward one week from the latest match date (never recreating
  // a cancelled week, since createNextMatch checks the target date first).
  if (active.length === 0) {
    const [latest] = await db
      .select({ id: matches.id })
      .from(matches)
      .orderBy(desc(matches.matchDate))
      .limit(1)

    if (latest) {
      const next = await createNextMatch(db, latest.id)
      if (next) matchesCreated++
    } else {
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
  }

  for (const match of active) {
    let transitioned = false
    if (match.status === 'scheduled' && now >= match.lockAt) {
      const result = await lockMatch(db, match.id, now)
      // Count a lock only when this tick performed the scheduled -> locked
      // transition. A tick that lost a concurrent race reports transitioned false.
      transitioned = result.ok && result.value.transitioned
      if (transitioned) locked++
    } else if (match.status === 'scheduled') {
      const expired = await expireOffers(db, match.id, now)
      expiredOffers += expired.expired
    }

    await advanceMatch(db, match.id, now)

    // Repair: create the successor when this tick transitioned the match (lock or
    // play) or when it was already locked before this tick (e.g. a page-triggered
    // lock). A tick that merely lost the lock race neither recreates nor recounts.
    const [after] = await db
      .select({ status: matches.status })
      .from(matches)
      .where(eq(matches.id, match.id))
    const wasLockedAtSelection = match.status === 'locked'
    if ((after?.status === 'locked' || after?.status === 'played') && (transitioned || wasLockedAtSelection)) {
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
