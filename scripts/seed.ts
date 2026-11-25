import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { eq } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { getDb } from '../src/db'
import { matches, settings, users } from '../src/db/schema'
import { createMatchForDate } from '../src/domain/matches'
import { createMember } from '../src/domain/members'
import { DEFAULT_SETTINGS, updateSettings } from '../src/domain/settings'
import { TZ } from '../src/lib/time'

async function main() {
  const db = getDb()
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Admin'
  let adminId: string | null = null

  if (adminEmail) {
    const [existing] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1)
    if (existing) {
      if (existing.role !== 'admin' || existing.status !== 'active') {
        throw new Error(
          `User ${adminEmail} exists but is not an active admin. Sign in once so ADMIN_EMAIL promotes it, or update the row directly.`
        )
      }
      adminId = existing.id
    } else {
      const { member } = await createMember(db, {
        name: adminName,
        email: adminEmail,
        role: 'admin',
        locale: 'he',
        status: 'active',
      })
      adminId = member.id
    }
  } else {
    const [existingAdmin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1)
    adminId = existingAdmin?.id ?? null
  }

  if (!adminId) {
    throw new Error('ADMIN_EMAIL is not set and no admin exists. Set ADMIN_EMAIL and run the seed again.')
  }

  const existingSettings = await db.select().from(settings)
  if (existingSettings.length === 0) {
    const result = await updateSettings(db, adminId, DEFAULT_SETTINGS)
    if (!result.ok) {
      throw new Error(`Failed to initialize settings: ${result.code}`)
    }
  }

  const today = DateTime.now().setZone(TZ).startOf('day')
  const daysToAdd = (2 - today.weekday + 7) % 7
  const targetTuesday = today.plus({ days: daysToAdd }).toISODate()
  if (!targetTuesday) {
    throw new Error('Failed to compute target Tuesday date')
  }

  const [existingMatch] = await db
    .select()
    .from(matches)
    .where(eq(matches.matchDate, targetTuesday))
  const matchExisted = Boolean(existingMatch)
  await createMatchForDate(db, targetTuesday)

  console.log(
    `Admin: ${adminEmail ?? adminId}; match for ${targetTuesday} ${
      matchExisted ? 'already exists' : 'created'
    }.`
  )
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
