import { beforeEach, expect, it } from 'vitest'
import { settings } from '@/db/schema'
import { testDb, resetDb } from '../db'
import { createMember } from '@/domain/members'
import { getSettings, updateSettings } from '@/domain/matches'
import { DEFAULT_SETTINGS } from '@/domain/settings'

beforeEach(resetDb)

it('provides default settings for Tuesday Football', () => {
  expect(DEFAULT_SETTINGS).toEqual({
    capacity: 14,
    costAgorot: 3500,
    venue: 'Onim (אונים)',
    venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6',
    kickoffTime: '20:00',
    queueWindowMinutes: 30,
  })
})

it('rejects settings changes from non-admins', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  expect(await updateSettings(testDb, member.id, { capacity: 16 })).toEqual({ ok: false, code: 'FORBIDDEN' })
})

it('rejects invalid values with INVALID_SETTING', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member

  expect(await updateSettings(testDb, admin.id, { capacity: 0 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect(await updateSettings(testDb, admin.id, { costAgorot: 0 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect(await updateSettings(testDb, admin.id, { kickoffTime: '25:00' })).toEqual({ ok: false, code: 'INVALID_SETTING' })
})

it('persists a valid update', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member

  const ok = await updateSettings(testDb, admin.id, {
    capacity: 16,
    costAgorot: 4000,
    venue: 'Hakoach',
    venueUrl: 'https://maps.google.com/?q=Hakoach',
  })
  expect(ok.ok).toBe(true)

  const settings = await getSettings(testDb)
  expect(settings.capacity).toBe(16)
  expect(settings.costAgorot).toBe(4000)
  expect(settings.venue).toBe('Hakoach')
  expect(settings.venueUrl).toBe('https://maps.google.com/?q=Hakoach')
})

it('splits a legacy venue value that still contains the map link', async () => {
  await testDb.insert(settings).values({
    key: 'venue',
    value: 'Onim (אונים) - https://maps.app.goo.gl/WPPALMNQFfW3MX7L6',
  })

  const result = await getSettings(testDb)
  expect(result.venue).toBe('Onim (אונים)')
  expect(result.venueUrl).toBe('https://maps.app.goo.gl/WPPALMNQFfW3MX7L6')
})

it('rejects an invalid venue map link', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  expect(await updateSettings(testDb, admin.id, { venueUrl: 'not-a-url' })).toEqual({
    ok: false,
    code: 'INVALID_SETTING',
  })
})

it('does not coerce blank stored values to zero and preserves defaults while valid values still win', async () => {
  await testDb.insert(settings).values([
    { key: 'capacity', value: '' },
    { key: 'costAgorot', value: '   ' },
    { key: 'queueWindowMinutes', value: '' },
  ])

  const defaultResult = await getSettings(testDb)
  expect(defaultResult.capacity).toBe(DEFAULT_SETTINGS.capacity)
  expect(defaultResult.costAgorot).toBe(DEFAULT_SETTINGS.costAgorot)
  expect(defaultResult.queueWindowMinutes).toBe(DEFAULT_SETTINGS.queueWindowMinutes)
  expect(defaultResult.venue).toBe(DEFAULT_SETTINGS.venue)
  expect(defaultResult.kickoffTime).toBe(DEFAULT_SETTINGS.kickoffTime)

  // A valid stored value still wins
  await testDb.insert(settings).values({ key: 'capacity', value: '18' })
    .onConflictDoUpdate({ target: settings.key, set: { value: '18' } })

  const updatedResult = await getSettings(testDb)
  expect(updatedResult.capacity).toBe(18)
  expect(updatedResult.costAgorot).toBe(DEFAULT_SETTINGS.costAgorot)
  expect(updatedResult.queueWindowMinutes).toBe(DEFAULT_SETTINGS.queueWindowMinutes)
  expect(updatedResult.venue).toBe(DEFAULT_SETTINGS.venue)
  expect(updatedResult.kickoffTime).toBe(DEFAULT_SETTINGS.kickoffTime)
})
