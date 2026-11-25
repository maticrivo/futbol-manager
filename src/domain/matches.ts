import { and, asc, count, DrizzleQueryError, eq, gte, inArray } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { Db } from '@/db'
import { entries, matches, users } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { TZ, weekSchedule } from '@/lib/time'
import { isHttpUrl } from '@/lib/venue'
import { writeAudit } from './audit'
import { lockMatch } from './entries'
import { getSettings, updateSettings, type Settings } from './settings'

export type Match = typeof matches.$inferSelect
export { getSettings, updateSettings, type Settings }

export type UpdateMatchPatch = {
  kickoffAt?: Date
  venue?: string
  venueUrl?: string | null
  capacity?: number
  costAgorot?: number
  signupOpensAt?: Date
  guestPhaseAt?: Date
  lockAt?: Date
  notes?: string
}

const PATCH_KEYS = new Set([
  'kickoffAt', 'venue', 'venueUrl', 'capacity', 'costAgorot', 'signupOpensAt', 'guestPhaseAt', 'lockAt', 'notes',
])
const MONEY_KEYS = new Set(['costAgorot', 'capacity', 'signupOpensAt', 'guestPhaseAt', 'lockAt'])

export async function updateMatch(
  db: Db,
  input: {
    actorId: string
    matchId: number
    now: Date
    patch: UpdateMatchPatch
  },
): Promise<Result<Match,
  'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_PATCH' | 'CAPACITY_BELOW_CONFIRMED' | 'MONEY_FIELDS_FROZEN' | 'MATCH_FINISHED'
>> {
  const { actorId, matchId, now, patch } = input
  const keys = Object.keys(patch)

  return db.transaction(async tx => {
    // Lock order: match row first, then the actor member row.
    const match = await lockMatch(tx, matchId)
    if (!match) return err('NOT_FOUND')
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).for('update')
    if (!actor || actor.role !== 'admin') return err('FORBIDDEN')

    if (match.status === 'played' || match.status === 'cancelled') return err('MATCH_FINISHED')

    if (keys.length === 0) return ok(match)

    for (const key of keys) {
      if (!PATCH_KEYS.has(key)) return err('INVALID_PATCH')
    }

    // "Locked" for freezing means locked status or a lazily-unapplied lock time.
    const locked = match.status === 'locked' || now >= match.lockAt
    if (locked) {
      for (const key of keys) {
        if (MONEY_KEYS.has(key)) return err('MONEY_FIELDS_FROZEN')
      }
    }

    const venue = patch.venue !== undefined ? patch.venue.trim() : undefined
    const venueUrl = patch.venueUrl !== undefined
      ? (patch.venueUrl === null || patch.venueUrl.trim() === '' ? null : patch.venueUrl.trim())
      : undefined
    const notes = patch.notes !== undefined ? patch.notes.trim() : undefined

    if (venue !== undefined && venue.length > 120) return err('INVALID_PATCH')
    if (venueUrl !== undefined && venueUrl !== null && (venueUrl.length > 500 || !isHttpUrl(venueUrl))) {
      return err('INVALID_PATCH')
    }
    if (notes !== undefined && [...notes].length > 2000) return err('INVALID_PATCH')

    if (patch.costAgorot !== undefined && (!Number.isInteger(patch.costAgorot) || patch.costAgorot <= 0)) {
      return err('INVALID_PATCH')
    }

    if (patch.capacity !== undefined) {
      if (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > 40) return err('INVALID_PATCH')
      const [row] = await tx.select({ total: count() }).from(entries)
        .where(and(eq(entries.matchId, matchId), eq(entries.status, 'confirmed')))
      if (patch.capacity < Number(row.total)) return err('CAPACITY_BELOW_CONFIRMED')
    }

    for (const key of ['kickoffAt', 'signupOpensAt', 'guestPhaseAt', 'lockAt'] as const) {
      const value = patch[key]
      if (value !== undefined && !(value instanceof Date && !Number.isNaN(value.getTime()))) {
        return err('INVALID_PATCH')
      }
    }

    if (patch.kickoffAt !== undefined) {
      const date = DateTime.fromJSDate(patch.kickoffAt, { zone: TZ }).toISODate()
      if (date !== match.matchDate) return err('INVALID_PATCH')
    }

    const signupOpensAt = patch.signupOpensAt ?? match.signupOpensAt
    const guestPhaseAt = patch.guestPhaseAt ?? match.guestPhaseAt
    const lockAt = patch.lockAt ?? match.lockAt
    const kickoffAt = patch.kickoffAt ?? match.kickoffAt
    if (!(signupOpensAt.getTime() < guestPhaseAt.getTime()
      && guestPhaseAt.getTime() < lockAt.getTime()
      && lockAt.getTime() < kickoffAt.getTime())) {
      return err('INVALID_PATCH')
    }

    const updates: Partial<typeof matches.$inferInsert> = { updatedAt: now }
    if (venue !== undefined) updates.venue = venue
    if (venueUrl !== undefined) updates.venueUrl = venueUrl
    if (notes !== undefined) updates.notes = notes
    if (patch.capacity !== undefined) updates.capacity = patch.capacity
    if (patch.costAgorot !== undefined) updates.costAgorot = patch.costAgorot
    if (patch.signupOpensAt !== undefined) updates.signupOpensAt = patch.signupOpensAt
    if (patch.guestPhaseAt !== undefined) updates.guestPhaseAt = patch.guestPhaseAt
    if (patch.lockAt !== undefined) updates.lockAt = patch.lockAt
    if (patch.kickoffAt !== undefined) updates.kickoffAt = patch.kickoffAt

    await tx.update(matches).set(updates).where(eq(matches.id, matchId))
    await writeAudit(tx, {
      actorId,
      action: 'match.update',
      entity: 'match',
      entityId: String(matchId),
      detail: { keys: [...keys].sort() },
      createdAt: now,
    })
    return ok({ ...match, ...updates } as Match)
  })
}

export async function openSignupsNow(
  db: Db,
  input: {
    actorId: string
    matchId: number
    now: Date
  },
): Promise<Result<Match, 'FORBIDDEN' | 'NOT_FOUND' | 'MATCH_FINISHED'>> {
  const { actorId, matchId, now } = input

  return db.transaction(async tx => {
    // Lock order: match row first, then the actor member row.
    const match = await lockMatch(tx, matchId)
    if (!match) return err('NOT_FOUND')
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).for('update')
    if (!actor || actor.role !== 'admin') return err('FORBIDDEN')

    if (match.status !== 'scheduled') return err('MATCH_FINISHED')

    await tx.update(matches).set({ signupOpensAt: now, updatedAt: now }).where(eq(matches.id, matchId))
    await writeAudit(tx, {
      actorId,
      action: 'match.open_signups',
      entity: 'match',
      entityId: String(matchId),
      detail: { signupOpensAt: now },
      createdAt: now,
    })
    return ok({ ...match, signupOpensAt: now, updatedAt: now } as Match)
  })
}

export async function getMatch(db: Db, matchId: number): Promise<Match | null> {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId))
  return match ?? null
}

async function getMatchByDate(db: Db, matchDate: string): Promise<Match | null> {
  const [match] = await db.select().from(matches).where(eq(matches.matchDate, matchDate))
  return match ?? null
}

function isDuplicateMatchError(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: string }).code === '23505'
  )
}

export async function createMatchForDateIfAbsent(
  db: Db,
  matchDate: string,
): Promise<{ match: Match; created: boolean }> {
  const existing = await getMatchByDate(db, matchDate)
  if (existing) {
    return { match: existing, created: false }
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
        venueUrl: currentSettings.venueUrl,
        costAgorot: currentSettings.costAgorot,
        capacity: currentSettings.capacity,
        status: 'scheduled',
      })
      .returning({ id: matches.id })

    const created = await getMatch(db, inserted.id)
    if (!created) {
      throw new Error(`Failed to retrieve newly created match for ${matchDate}`)
    }
    return { match: created, created: true }
  } catch (error: unknown) {
    if (isDuplicateMatchError(error)) {
      const match = await getMatchByDate(db, matchDate)
      if (match) return { match, created: false }
    }
    throw error
  }
}

export async function createMatchForDate(db: Db, matchDate: string): Promise<Match> {
  return (await createMatchForDateIfAbsent(db, matchDate)).match
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
