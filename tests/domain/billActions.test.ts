import { eq } from 'drizzle-orm'
import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { savePrefsAction } from '@/app/actions/bill'
import { notificationPrefs } from '@/db/schema'
import { createMember } from '@/domain/members'
import { listNotificationPrefs, NOTIFICATION_CATEGORIES } from '@/domain/notifications'
import { requireMember } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireMember: vi.fn() }))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

function form(enabled: readonly string[]) {
  const data = new FormData()
  for (const category of NOTIFICATION_CATEGORIES) {
    if (enabled.includes(category)) data.set(category, 'on')
  }
  return data
}

const checked = ['lock_reminder', 'bill_ready'] as const

it('enables checked categories, disables the rest, and revalidates the bill once', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  vi.mocked(requireMember).mockResolvedValue(member)

  expect(await savePrefsAction(null, form(checked))).toEqual({ ok: true })
  expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/bill')

  const prefs = await listNotificationPrefs(testDb, member.id)
  for (const category of NOTIFICATION_CATEGORIES) {
    expect(prefs[category]).toBe(checked.includes(category as (typeof checked)[number]))
  }
})

it('stays at six rows when the same form is submitted twice', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  vi.mocked(requireMember).mockResolvedValue(member)

  await savePrefsAction(null, form(checked))
  await savePrefsAction(null, form(checked))

  const rows = await testDb.select().from(notificationPrefs).where(eq(notificationPrefs.memberId, member.id))
  expect(rows).toHaveLength(NOTIFICATION_CATEGORIES.length)
  expect(rows.map(row => row.category).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort())
})

it('rolls back a failed save, returns UNKNOWN, and does not revalidate', async () => {
  const { member } = await createMember(testDb, { name: 'Ghost' })
  vi.mocked(requireMember).mockResolvedValue({ ...member, id: '00000000-0000-4000-8000-000000000000' })
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    expect(await savePrefsAction(null, form(checked))).toEqual({ ok: false, code: 'UNKNOWN' })
    expect(await testDb.select().from(notificationPrefs)).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  } finally {
    errorSpy.mockRestore()
  }
})
