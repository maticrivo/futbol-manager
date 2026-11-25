import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '@/db/schema'
import { createMember } from '@/domain/members'
import { testDb, resetDb } from '../db'
import ProfilePage from '@/app/profile/page'
import Nav from '@/components/Nav'
import ProfileForm from '@/components/ProfileForm'
import { redirect } from 'next/navigation'

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => {
    const t = (key: string) => key
    t.has = () => true
    return t
  }),
  useLocale: vi.fn(() => 'en'),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}))

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))

import { auth } from '@/auth'

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
})

describe('ProfilePage & Nav integration', () => {
  it('ProfilePage redirects unauthenticated visitors to /login/expired', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login/expired')
    expect(redirect).toHaveBeenCalledWith('/login/expired')
  })

  it('ProfilePage renders for pending members so they can complete their profile', async () => {
    const pending = (await createMember(testDb, {
      name: 'Pending',
      email: 'pending@example.com',
      status: 'pending',
    })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: pending.id } } as never)

    const element = await ProfilePage()
    expect(element).toBeDefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('ProfilePage redirects disabled members to /login/expired', async () => {
    const member = (await createMember(testDb, { name: 'DisabledUser', email: 'disabled@example.com' })).member
    await testDb.update(users).set({ status: 'disabled' }).where(eq(users.id, member.id))
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never)

    await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login/expired')
  })

  it('ProfilePage renders for active member with fresh DB data', async () => {
    const member = (await createMember(testDb, {
      name: 'ActiveUser',
      email: 'active@example.com',
      nickname: 'Acty',
      phone: '+1 555 999 8888',
      image: 'https://example.com/acty.jpg',
    })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never)

    const element = await ProfilePage()
    expect(element).toBeDefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('ConnectedAccounts shows a linked provider and a connect action for the other', async () => {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const ConnectedAccounts = (await import('@/components/ConnectedAccounts')).default

    const html = renderToStaticMarkup(
      React.createElement(ConnectedAccounts, { linked: ['google'], available: ['google', 'facebook'] }),
    )
    expect(html).toContain('title')
    expect(html).toContain('connected')
    expect(html).toContain('connectProvider')
    expect(html).toContain('value="facebook"')
  })

  it('ConnectedAccounts hides a provider that is not configured', async () => {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const ConnectedAccounts = (await import('@/components/ConnectedAccounts')).default

    const html = renderToStaticMarkup(
      React.createElement(ConnectedAccounts, { linked: ['google'], available: ['google'] }),
    )
    expect(html).toContain('connected')
    expect(html).not.toContain('value="facebook"')
  })

  it('Nav renders profile link for active members', async () => {
    const member = (await createMember(testDb, { name: 'ActiveNavUser', email: 'nav@example.com' })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never)

    const nav = await Nav({ children: null })
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(nav)
    expect(html).toContain('href="/profile"')
  })

  it('Nav does not render profile link for pending members', async () => {
    const pending = (await createMember(testDb, {
      name: 'PendingNav',
      email: 'pending-nav@example.com',
      status: 'pending',
    })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: pending.id } } as never)

    const nav = await Nav({ children: null })
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(nav)
    expect(html).not.toContain('href="/profile"')
  })

  it('ProfileForm renders prefilled values and a read-only email', async () => {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const testMember = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Existing Member',
      email: 'existing@example.com',
      phone: '+972501234567',
      nickname: 'Exister',
      image: 'https://example.com/ex.png',
      role: 'member' as const,
      locale: 'en',
      status: 'active' as const,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const html = renderToStaticMarkup(React.createElement(ProfileForm, { member: testMember }))
    expect(html).toContain('value="Existing Member"')
    expect(html).toContain('existing@example.com')
    expect(html).toContain('value="+972501234567"')
    expect(html).toContain('value="Exister"')
    expect(html).toContain('src="https://example.com/ex.png"')
    expect(html).not.toContain('name="email"')
  })
})
