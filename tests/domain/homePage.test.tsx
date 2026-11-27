import type { ReactNode } from 'react'
import { prerender } from 'react-dom/static'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { entries, users } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember, type Member } from '@/domain/members'
import { requireMember } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next-intl/server', () => {
  const t = Object.assign((key: string) => key, { rich: (key: string) => key, has: () => true })
  return { getTranslations: vi.fn(async () => t), getLocale: vi.fn(async () => 'en') }
})
vi.mock('next-intl', () => {
  const t = Object.assign((key: string) => key, { rich: (key: string) => key, has: () => true })
  return { useTranslations: () => t }
})
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/lib/auth', () => ({ requireMember: vi.fn() }))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))
// Render each action as a marker so the test can read which ones a state offers.
vi.mock('@/components/MatchActionForm', () => ({
  default: ({ intent }: { intent: string }) => <i data-intent={intent} />,
}))

import Home from '@/app/page'

// The page has async server components, which the synchronous renderer cannot wait for.
async function renderHtml(node: ReactNode) {
  const { prelude } = await prerender(node)
  return new Response(prelude).text()
}

const open = new Date('2027-03-27T10:00:00Z') // Saturday, signups open

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(open)
})
afterEach(() => {
  vi.useRealTimers()
})

async function render(viewer: Member) {
  vi.mocked(requireMember).mockResolvedValue(viewer)
  return renderHtml(await Home())
}

function intents(html: string) {
  return [...html.matchAll(/data-intent="([a-zA-Z]+)"/g)].map(([, intent]) => intent)
}

async function scenario({ full = false } = {}) {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const viewer = (await createMember(testDb, { name: 'Viewer' })).member
  await createMember(testDb, { name: 'Nadia Unanswered' })
  const out = (await createMember(testDb, { name: 'Diego Declined' })).member
  await testDb.insert(entries).values({ matchId: match.id, memberId: out.id, kind: 'member', status: 'declined' })
  if (full) {
    const players = await testDb.insert(users)
      .values(Array.from({ length: 14 }, (_, i) => ({ name: `Player ${i}`, status: 'active' as const }))).returning()
    await testDb.insert(entries).values(players.map(p => ({
      matchId: match.id, memberId: p.id, kind: 'member' as const, status: 'confirmed' as const,
    })))
  }
  return { match, admin, viewer }
}

it('shows who is not going to everyone, but who has not answered only to admins', async () => {
  const { admin, viewer } = await scenario()

  const asMember = await render(viewer)
  expect(asMember).toContain('Diego Declined')
  expect(asMember).not.toContain('Nadia Unanswered')
  expect(asMember).not.toContain('responses.unanswered')

  const asAdmin = await render(admin)
  expect(asAdmin).toContain('Diego Declined')
  expect(asAdmin).toContain('Nadia Unanswered')
})

// Document order: desktop answer actions, then the waiting-list card, then the mobile bar,
// which repeats the answer actions in the same order.
it.each([
  ['unanswered', undefined, false, ['signup', 'decline'], []],
  ['confirmed', 'confirmed', false, ['decline', 'withdraw'], []],
  ['declined', 'declined', false, ['signup', 'undecided'], []],
  ['unanswered on a full match', undefined, true, ['decline'], ['join']],
  ['queued', 'queued', true, [], ['decline', 'leave']],
  ['offered', 'offered', true, [], ['claim', 'decline']],
] as const)('offers the right answers to a %s member', async (_, status, full, answer, queue) => {
  const { match, viewer } = await scenario({ full })
  if (status) {
    await testDb.insert(entries).values({
      matchId: match.id, memberId: viewer.id, kind: 'member', status,
      ...(status === 'offered' ? { offeredAt: open, offerExpiresAt: new Date(open.getTime() + 30 * 60_000) } : {}),
    })
  }
  expect(intents(await render(viewer))).toEqual([...answer, ...queue, ...answer])
})
