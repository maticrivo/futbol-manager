import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { eq } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { getDb } from '../src/db'
import { matches, members, settings } from '../src/db/schema'
import { createMatchForDate } from '../src/domain/matches'
import { createMember } from '../src/domain/members'
import { DEFAULT_SETTINGS, updateSettings } from '../src/domain/settings'
import { TZ } from '../src/lib/time'

async function main() {
  const db = getDb()
  let rawUrl = process.env.APP_URL?.trim()
  if (rawUrl) {
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = `https://${rawUrl}`
    }
  }
  const baseUrl = (rawUrl || 'http://localhost:3000').replace(/\/+$/, '')

  const existingMembers = await db.select().from(members)
  const existingByName = new Map(existingMembers.map((m) => [m.name, m]))

  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Admin'
  let adminId: number | null = null
  let createdCount = 0
  let skippedCount = 0

  const existingAdmin = existingByName.get(adminName)
  if (existingAdmin && existingAdmin.role === 'admin') {
    adminId = existingAdmin.id
    skippedCount++
  } else if (!existingAdmin) {
    const { member: newAdmin, inviteToken } = await createMember(db, {
      name: adminName,
      role: 'admin',
      locale: 'he',
    })
    adminId = newAdmin.id
    existingByName.set(newAdmin.name, newAdmin)
    createdCount++
    console.log(`${newAdmin.name}: ${baseUrl}/login/${inviteToken}`)
  } else {
    for (let i = 1; i <= 5; i++) {
      const candidateName = i === 1 ? `${adminName} (admin)` : `${adminName} (admin ${i})`
      const candidate = existingByName.get(candidateName)
      if (candidate) {
        if (candidate.role === 'admin') {
          adminId = candidate.id
          skippedCount++
          console.error(
            `Warning: "${adminName}" already exists as a member; using existing admin "${candidateName}" instead.`
          )
          break
        }
        continue
      }

      const { member: newAdmin, inviteToken } = await createMember(db, {
        name: candidateName,
        role: 'admin',
        locale: 'he',
      })
      adminId = newAdmin.id
      existingByName.set(newAdmin.name, newAdmin)
      createdCount++
      console.error(
        `Warning: "${adminName}" already exists as a member; created admin "${candidateName}" instead.`
      )
      console.log(`${newAdmin.name}: ${baseUrl}/login/${inviteToken}`)
      break
    }

    if (!adminId) {
      throw new Error(
        `Failed to resolve admin: "${adminName}" exists as a member and no free admin candidate could be found in 5 attempts. Please set SEED_ADMIN_NAME to an unused name.`
      )
    }
  }

  const existingSettings = await db.select().from(settings)
  if (existingSettings.length === 0) {
    const result = await updateSettings(db, adminId, DEFAULT_SETTINGS)
    if (!result.ok) {
      throw new Error(`Failed to initialize settings: ${result.code}`)
    }
  }

  let targetMemberNames: string[]
  if (process.env.SEED_MEMBERS !== undefined && process.env.SEED_MEMBERS.trim() !== '') {
    targetMemberNames = process.env.SEED_MEMBERS.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (targetMemberNames.length === 0) {
      targetMemberNames = Array.from({ length: 18 }, (_, i) => `Player ${i + 1}`)
    }
  } else {
    targetMemberNames = Array.from({ length: 18 }, (_, i) => `Player ${i + 1}`)
  }

  for (const name of targetMemberNames) {
    if (existingByName.has(name)) {
      skippedCount++
    } else {
      const { member: newMember, inviteToken } = await createMember(db, {
        name,
        role: 'member',
        locale: 'he',
      })
      existingByName.set(newMember.name, newMember)
      createdCount++
      console.log(`${newMember.name}: ${baseUrl}/login/${inviteToken}`)
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
  const matchCreated = !matchExisted

  console.log(
    `Summary: ${createdCount} created, ${skippedCount} skipped; match for ${targetTuesday} ${
      matchCreated ? 'created' : 'already exists'
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
