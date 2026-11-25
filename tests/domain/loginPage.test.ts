import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { auth, signIn } from '@/auth'
import { signInWithProviderAction } from '@/app/actions/auth'
import { createMember } from '@/domain/members'
import { resetDb, testDb } from '../db'
import LoginPage from '@/app/login/page'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

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

describe('social login page', () => {
  it('shows the email-missing message and both provider buttons while signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: 'email-missing' }) }),
    )

    expect(html).toContain('emailMissing')
    expect(html).toContain('name="provider"')
    expect(html).toContain('value="google"')
    expect(html).toContain('value="facebook"')
    expect(html).toContain('continueWithGoogle')
    expect(html).toContain('continueWithFacebook')
  })

  it('shows a generic message for an unknown auth error', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: 'Configuration' }) }),
    )

    expect(html).toContain('signInError')
    expect(html).toContain('name="provider"')
  })

  it('rejects unknown providers before calling Auth.js', async () => {
    const data = new FormData()
    data.set('provider', 'github')
    await signInWithProviderAction(data)
    expect(signIn).not.toHaveBeenCalled()
  })

  it('starts a valid provider sign-in with the requested destination', async () => {
    const data = new FormData()
    data.set('provider', 'google')
    data.set('redirectTo', '/profile')
    await signInWithProviderAction(data)
    expect(signIn).toHaveBeenCalledWith('google', { redirectTo: '/profile' })
  })

  it('shows the link-conflict message with a way back to the profile', async () => {
    const member = (await createMember(testDb, { name: 'M', email: 'm@example.com' })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never)

    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: 'OAuthAccountNotLinked' }) }),
    )

    expect(html).toContain('accountLinkedElsewhere')
    expect(html).toContain('href="/profile"')
  })
})
