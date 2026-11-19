import { beforeEach, expect, it } from 'vitest'
import { settings } from '@/db/schema'
import { testDb, resetDb } from '../db'
import { createMember } from '@/domain/members'
import { getSettings, updateSettings } from '@/domain/matches'
import { DEFAULT_SETTINGS } from '@/domain/settings'

beforeEach(resetDb)

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

  const ok = await updateSettings(testDb, admin.id, { capacity: 16, costAgorot: 4000 })
  expect(ok.ok).toBe(true)

  const settings = await getSettings(testDb)
  expect(settings.capacity).toBe(16)
  expect(settings.costAgorot).toBe(4000)
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

  // A valid stored value still wins
  await testDb.insert(settings).values({ key: 'capacity', value: '18' })
    .onDuplicateKeyUpdate({ set: { value: '18' } })

  const updatedResult = await getSettings(testDb)
  expect(updatedResult.capacity).toBe(18)
  expect(updatedResult.costAgorot).toBe(DEFAULT_SETTINGS.costAgorot)
  expect(updatedResult.queueWindowMinutes).toBe(DEFAULT_SETTINGS.queueWindowMinutes)
})
