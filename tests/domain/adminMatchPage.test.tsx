import type { ReactNode } from 'react'
import { prerender } from 'react-dom/static'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { entries } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { requireAdmin } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next-intl/server', () => {
  const t = Object.assign((key: string) => key, { rich: (key: string) => key, has: () => true })
  return { getTranslations: vi.fn(async () => t), getLocale: vi.fn(async () => 'en') }
})
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'admin.example', 'x-forwarded-proto': 'https' })),
}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))
// The admin forms are covered elsewhere; this test is about the response lists.
for (const form of [
  'AdminRoster', 'AttendanceList', 'CancelMatchForm', 'CopyMessage', 'DeleteMatchForm', 'EditMatchForm', 'GuestPayments',
]) {
  vi.doMock(`@/components/${form}`, () => ({ default: () => null }))
}

// The page has async server components, which the synchronous renderer cannot wait for.
async function renderHtml(node: ReactNode) {
  const { prelude } = await prerender(node)
  return new Response(prelude).text()
}

const open = new Date('2027-03-27T10:00:00Z')

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(open)
})
afterEach(() => {
  vi.useRealTimers()
})

it('lists who is not going and who has not answered', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  await createMember(testDb, { name: 'Nadia Unanswered' })
  const out = (await createMember(testDb, { name: 'Diego Declined' })).member
  await testDb.insert(entries).values({ matchId: match.id, memberId: out.id, kind: 'member', status: 'declined' })
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const { default: AdminMatchPage } = await import('@/app/admin/matches/[id]/page')
  const html = await renderHtml(await AdminMatchPage({ params: Promise.resolve({ id: String(match.id) }) }))
  expect(html).toContain('Diego Declined')
  expect(html).toContain('Nadia Unanswered')
})
