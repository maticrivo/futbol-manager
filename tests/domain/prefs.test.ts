import { and, eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { notificationPrefs } from '@/db/schema'
import { createMember } from '@/domain/members'
import { listNotificationPrefs, NOTIFICATION_CATEGORIES, setNotificationPref } from '@/domain/notifications'
import { resetDb, testDb } from '../db'

beforeEach(resetDb)

const allOn = () => Object.fromEntries(NOTIFICATION_CATEGORIES.map(category => [category, true]))

it('contains exactly the six schema categories with no duplicates', () => {
  const expected = ['signup_open', 'guest_phase', 'lock_reminder', 'queue_offer', 'bill_ready', 'payment_reminder']
  expect(NOTIFICATION_CATEGORIES).toHaveLength(expected.length)
  expect(new Set(NOTIFICATION_CATEGORIES)).toEqual(new Set(expected))
})

it('defaults every category on and persists a switch-off', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  expect(await listNotificationPrefs(testDb, member.id)).toEqual(allOn())

  await setNotificationPref(testDb, member.id, 'lock_reminder', false)
  const prefs = await listNotificationPrefs(testDb, member.id)
  expect(prefs.lock_reminder).toBe(false)
  expect(prefs).toEqual({ ...allOn(), lock_reminder: false })
})

it('switching a category back on leaves exactly one row for that member and category', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })

  await setNotificationPref(testDb, member.id, 'lock_reminder', false)
  await setNotificationPref(testDb, member.id, 'lock_reminder', true)

  expect((await listNotificationPrefs(testDb, member.id)).lock_reminder).toBe(true)
  expect(await testDb.select().from(notificationPrefs)
    .where(and(eq(notificationPrefs.memberId, member.id), eq(notificationPrefs.category, 'lock_reminder'))))
    .toHaveLength(1)
})

it('does not affect another member’s preferences', async () => {
  const { member: ana } = await createMember(testDb, { name: 'Ana' })
  const { member: ben } = await createMember(testDb, { name: 'Ben' })

  await setNotificationPref(testDb, ana.id, 'payment_reminder', false)

  expect(await listNotificationPrefs(testDb, ben.id)).toEqual(allOn())
  expect((await listNotificationPrefs(testDb, ana.id)).payment_reminder).toBe(false)
})
