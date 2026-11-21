import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { testDb, resetDb } from '../db'
import { createMember, loginWithInvite, requestMemberAccess, setMemberStatus } from '@/domain/members'
import { SESSION_COOKIE } from '@/lib/auth'
import ProfilePage from '@/app/profile/page'
import Nav from '@/components/Nav'
import ProfileForm from '@/components/ProfileForm'
import LoginForm from '@/components/LoginForm'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

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
  cookies: vi.fn(),
  headers: vi.fn(async () => new Headers({ host: 'localhost:3000' })),
}))

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))

const now = new Date('2027-03-27T10:00:00Z')

function mockSessionCookie(token?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) =>
      token && name === SESSION_COOKIE ? { name, value: token } : undefined
    ),
  } as unknown as Awaited<ReturnType<typeof cookies>>)
}

describe('ProfilePage & Nav integration', () => {
  beforeEach(async () => {
    await resetDb()
    vi.clearAllMocks()
  })

  it('ProfilePage redirects unauthenticated visitors to /login/expired', async () => {
    mockSessionCookie()

    await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login/expired')
    expect(redirect).toHaveBeenCalledWith('/login/expired')
  })

  it('ProfilePage redirects pending members to /login/pending', async () => {
    const res = await requestMemberAccess(testDb, 'pending-profile@example.com', now)
    if (!res.ok) throw new Error(res.code)
    const login = await loginWithInvite(testDb, res.value.inviteToken, now)
    if (!login.ok) throw new Error(login.code)

    mockSessionCookie(login.value.sessionToken)

    await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login/pending')
    expect(redirect).toHaveBeenCalledWith('/login/pending')
  })

  it('ProfilePage redirects disabled members to /login/expired', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const { member, inviteToken } = await createMember(testDb, { name: 'DisabledUser' })
    const login = await loginWithInvite(testDb, inviteToken, now)
    if (!login.ok) throw new Error(login.code)

    await setMemberStatus(testDb, admin.id, member.id, 'disabled')
    mockSessionCookie(login.value.sessionToken)

    await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login/expired')
    expect(redirect).toHaveBeenCalledWith('/login/expired')
  })

  it('ProfilePage renders for active member with fresh DB data', async () => {
    const { inviteToken } = await createMember(testDb, {
      name: 'ActiveUser',
      nickname: 'Acty',
      phone: '+1 555 999 8888',
      image: 'https://example.com/acty.jpg',
    })
    const login = await loginWithInvite(testDb, inviteToken, now)
    if (!login.ok) throw new Error(login.code)

    mockSessionCookie(login.value.sessionToken)

    const element = await ProfilePage()
    expect(element).toBeDefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('Nav renders profile link for active members', async () => {
    const { inviteToken } = await createMember(testDb, { name: 'ActiveNavUser' })
    const login = await loginWithInvite(testDb, inviteToken, now)
    if (!login.ok) throw new Error(login.code)

    mockSessionCookie(login.value.sessionToken)

    const nav = await Nav({ children: null })
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(nav)
    expect(html).toContain('href="/profile"')
  })

  it('Nav does not render profile link for pending members', async () => {
    const res = await requestMemberAccess(testDb, 'pending-nav@example.com', now)
    if (!res.ok) throw new Error(res.code)
    const login = await loginWithInvite(testDb, res.value.inviteToken, now)
    if (!login.ok) throw new Error(login.code)

    mockSessionCookie(login.value.sessionToken)

    const nav = await Nav({ children: null })
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(nav)
    expect(html).not.toContain('href="/profile"')
  })

  it('ProfileForm renders with prefilled member values and correct attributes', async () => {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const testMember = {
      id: 123,
      name: 'Existing Member',
      email: 'existing@example.com',
      phone: '+972501234567',
      nickname: 'Exister',
      image: 'https://example.com/ex.png',
      role: 'member' as const,
      locale: 'en',
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const html = renderToStaticMarkup(React.createElement(ProfileForm, { member: testMember }))
    expect(html).toContain('value="Existing Member"')
    expect(html).toContain('value="existing@example.com"')
    expect(html).toContain('value="+972501234567"')
    expect(html).toContain('value="Exister"')
    expect(html).toContain('src="https://example.com/ex.png"')
    expect(html).toContain('required')
  })

  it('LoginForm renders optional profile fields inside details', async () => {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(React.createElement(LoginForm))
    expect(html).toContain('<details')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="nickname"')
    expect(html).toContain('name="phone"')
    expect(html).toContain('name="image"')
    expect(html).toContain('type="tel"')
    expect(html).toContain('type="url"')
  })

  it('all message files (en, he, es) have identical key structure', () => {
    function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      const keys: string[] = []
      for (const k of Object.keys(obj).sort()) {
        const full = prefix ? `${prefix}.${k}` : k
        const val = obj[k]
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          keys.push(...getKeys(val as Record<string, unknown>, full))
        } else {
          keys.push(full)
        }
      }
      return keys
    }

    const enPath = path.resolve(process.cwd(), 'messages/en.json')
    const hePath = path.resolve(process.cwd(), 'messages/he.json')
    const esPath = path.resolve(process.cwd(), 'messages/es.json')

    const enKeys = getKeys(JSON.parse(fs.readFileSync(enPath, 'utf8')))
    const heKeys = getKeys(JSON.parse(fs.readFileSync(hePath, 'utf8')))
    const esKeys = getKeys(JSON.parse(fs.readFileSync(esPath, 'utf8')))

    expect(heKeys).toEqual(enKeys)
    expect(esKeys).toEqual(enKeys)
  })
})
