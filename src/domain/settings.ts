import { eq } from 'drizzle-orm'
import type { Db, Executor } from '@/db'
import { users, settings } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { isHttpUrl, splitVenue } from '@/lib/venue'
import { writeAudit } from './audit'

export type Settings = {
  capacity: number
  costAgorot: number
  venue: string
  venueUrl: string
  kickoffTime: string
  queueWindowMinutes: number
}

export const DEFAULT_SETTINGS: Settings = {
  capacity: 14,
  costAgorot: 3500,
  venue: 'Onim (אונים)',
  venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6',
  kickoffTime: '20:00',
  queueWindowMinutes: 30,
}

const VALID_SETTING_KEYS: Set<string> = new Set([
  'capacity',
  'costAgorot',
  'venue',
  'venueUrl',
  'kickoffTime',
  'queueWindowMinutes',
])

const KICKOFF_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function parseNumericSetting(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback
  const trimmed = val.trim()
  if (trimmed === '') return fallback
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : fallback
}

export async function getSettings(db: Executor): Promise<Settings> {
  const rows = await db.select().from(settings)
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const capacityVal = map.get('capacity')
  const costVal = map.get('costAgorot')
  const venueVal = map.get('venue')
  const venueUrlVal = map.get('venueUrl')
  const kickoffVal = map.get('kickoffTime')
  const queueVal = map.get('queueWindowMinutes')

  const storedVenue = venueVal !== undefined ? venueVal : DEFAULT_SETTINGS.venue
  const legacy = splitVenue(storedVenue)
  const venue = venueUrlVal === undefined ? legacy.venue : storedVenue
  const venueUrl = venueUrlVal !== undefined
    ? venueUrlVal
    : legacy.venueUrl ?? DEFAULT_SETTINGS.venueUrl

  return {
    capacity: parseNumericSetting(capacityVal, DEFAULT_SETTINGS.capacity),
    costAgorot: parseNumericSetting(costVal, DEFAULT_SETTINGS.costAgorot),
    venue,
    venueUrl,
    kickoffTime: kickoffVal !== undefined ? kickoffVal : DEFAULT_SETTINGS.kickoffTime,
    queueWindowMinutes: parseNumericSetting(queueVal, DEFAULT_SETTINGS.queueWindowMinutes),
  }
}

export async function updateSettings(
  db: Db,
  actorId: string,
  patch: Partial<Settings>
): Promise<Result<Settings, 'FORBIDDEN' | 'INVALID_SETTING'>> {
  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, actorId))

  if (!actor || actor.role !== 'admin') {
    return err('FORBIDDEN')
  }

  const patchKeys = Object.keys(patch)
  for (const key of patchKeys) {
    if (!VALID_SETTING_KEYS.has(key)) {
      return err('INVALID_SETTING')
    }
  }

  if (patch.capacity !== undefined) {
    if (
      typeof patch.capacity !== 'number' ||
      !Number.isInteger(patch.capacity) ||
      patch.capacity < 1 ||
      patch.capacity > 40
    ) {
      return err('INVALID_SETTING')
    }
  }

  if (patch.costAgorot !== undefined) {
    if (
      typeof patch.costAgorot !== 'number' ||
      !Number.isInteger(patch.costAgorot) ||
      patch.costAgorot <= 0
    ) {
      return err('INVALID_SETTING')
    }
  }

  if (patch.kickoffTime !== undefined) {
    if (typeof patch.kickoffTime !== 'string' || !KICKOFF_REGEX.test(patch.kickoffTime)) {
      return err('INVALID_SETTING')
    }
  }

  if (patch.queueWindowMinutes !== undefined) {
    if (
      typeof patch.queueWindowMinutes !== 'number' ||
      !Number.isInteger(patch.queueWindowMinutes) ||
      patch.queueWindowMinutes < 5 ||
      patch.queueWindowMinutes > 1440
    ) {
      return err('INVALID_SETTING')
    }
  }

  if (patch.venue !== undefined) {
    if (typeof patch.venue !== 'string' || patch.venue.length > 160) {
      return err('INVALID_SETTING')
    }
  }

  if (patch.venueUrl !== undefined) {
    if (patch.venueUrl !== null && patch.venueUrl !== '') {
      if (typeof patch.venueUrl !== 'string' || patch.venueUrl.length > 500 || !isHttpUrl(patch.venueUrl)) {
        return err('INVALID_SETTING')
      }
    }
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        await tx
          .insert(settings)
          .values({
            key,
            value: value !== null ? String(value) : '',
          })
          .onConflictDoUpdate({
            target: settings.key,
            set: {
              value: value !== null ? String(value) : '',
            },
          })
      }
    }

    await writeAudit(tx, {
      actorId,
      action: 'settings.update',
      entity: 'settings',
      detail: patch,
    })
  })

  const updated = await getSettings(db)
  return ok(updated)
}
