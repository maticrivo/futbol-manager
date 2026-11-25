import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { notificationPrefs } from '@/db/schema'
import { createMember } from '@/domain/members'
import { savePrefsAction } from '@/app/actions/bill'
import { requireSessionMember } from '@/lib/auth'
import { resetDb, testDb } from '../db'

let calls = 0

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireSessionMember: vi.fn() }))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))
vi.mock('@/domain/notifications', async importOriginal => {
  const actual = await importOriginal<typeof import('@/domain/notifications')>()
  return {
    ...actual,
    setNotificationPref: async (...args: Parameters<typeof actual.setNotificationPref>) => {
      calls += 1
      if (calls === 2) throw Object.assign(new Error('injected failure'), { code: 'ER_LOCK_DEADLOCK' })
      return actual.setNotificationPref(...args)
    },
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  calls = 0
  await resetDb()
})

it('rolls back a real first write when a later upsert fails', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  vi.mocked(requireSessionMember).mockResolvedValue(member)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const form = new FormData()
    form.set('signup_open', 'on')
    form.set('guest_phase', 'on')

    expect(await savePrefsAction(null, form)).toEqual({ ok: false, code: 'UNKNOWN' })

    // Without the transaction, the first (real) upsert would remain committed here.
    expect(await testDb.select().from(notificationPrefs)).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledOnce()
  } finally {
    errorSpy.mockRestore()
  }
})
