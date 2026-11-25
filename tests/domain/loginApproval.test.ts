import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMember } from '@/domain/members'
import { resetDb, testDb } from '../db'
import PendingPage from '@/app/login/pending/page'
import { auth } from '@/auth'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}))

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
})

describe('Pending status page', () => {
  it('redirects unauthenticated visitors to /login', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('redirects active members to the app', async () => {
    const active = (await createMember(testDb, { name: 'Active', email: 'active@example.com' })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: active.id } } as never)
    await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('renders the pending notice and profile link for pending members', async () => {
    const pending = (await createMember(testDb, {
      name: 'Pending',
      email: 'pending@example.com',
      status: 'pending',
    })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: pending.id } } as never)

    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('pendingTitle')
    expect(html).toContain('pendingDescription')
    expect(html).toContain('href="/profile"')
  })
})
