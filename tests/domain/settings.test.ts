import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMember } from '@/domain/members'
import { getSettings, updateSettings } from '@/domain/matches'

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
