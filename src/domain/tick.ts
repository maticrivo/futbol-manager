import { asc, desc, DrizzleQueryError, eq, inArray } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { Db } from '@/db'
import { matches } from '@/db/schema'
import type { PushTransport } from '@/lib/push'
import { TZ } from '@/lib/time'
import { ensureBagDuty } from './bag'
import { advanceMatch, lockMatch } from './lock'
import { createMatchForDateIfAbsent, createNextMatch } from './matches'
import { notifyBagDuty, processDueNotifications } from './notifications'
import { expireOffers } from './queue'

export type TickCounts = {
  locked: number
  matchesCreated: number
  expiredOffers: number
  notificationsSent: number
  bagDuties: number
}

function isDuplicateMatch(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: string }).code === '23505'
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
  let notificationsSent = 0
  let bagDuties = 0

  const active = await db
    .select()
    .from(matches)
    .where(inArray(matches.status, ['scheduled', 'locked']))
    .orderBy(asc(matches.kickoffAt))

  // Self-heal: recover the schedule when no active week exists. With no matches at
  // all, schedule the next Tuesday strictly after `now`. With matches but none
  // active, start from the later of (the next Tuesday after `now`, the latest
  // match date + 7 days) and walk forward in 7-day steps to the first date with
  // no row, so runs of cancelled weeks are skipped instead of blocking recovery.
  if (active.length === 0) {
    const local = DateTime.fromJSDate(now, { zone: TZ })
    const nextTuesday = local.plus({ days: ((2 - local.weekday + 7) % 7) || 7 }).toISODate()

    const [latest] = await db
      .select({ matchDate: matches.matchDate })
      .from(matches)
      .orderBy(desc(matches.matchDate))
      .limit(1)

    if (!latest) {
      if (nextTuesday) {
        const { created } = await createMatchForDateIfAbsent(db, nextTuesday)
        if (created) matchesCreated++
      }
    } else {
      const afterLatest = DateTime.fromISO(latest.matchDate, { zone: TZ }).plus({ days: 7 }).toISODate()
      let cursor: string | null = null
      if (nextTuesday !== null && afterLatest !== null) {
        cursor = afterLatest > nextTuesday ? afterLatest : nextTuesday
      } else {
        cursor = nextTuesday ?? afterLatest
      }

      for (let i = 0; cursor !== null && i < 12; i++) {
        const { created } = await createMatchForDateIfAbsent(db, cursor)
        if (created) {
          matchesCreated++
          break
        }
        cursor = DateTime.fromISO(cursor, { zone: TZ }).plus({ days: 7 }).toISODate()
      }
    }
  }

  for (const match of active) {
    const draw = await ensureBagDuty(db, { matchId: match.id, now })
    if (draw.created) bagDuties++
    if (draw.duty) notificationsSent += await notifyBagDuty(db, { match, duty: draw.duty, transport, now })

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
  return { locked, matchesCreated, expiredOffers, notificationsSent: notificationsSent + sent, bagDuties }
}
