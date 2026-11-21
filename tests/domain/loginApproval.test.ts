import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMember, loginWithInvite, requestMemberAccess, setMemberStatus } from '@/domain/members'
import { getSessionMember } from '@/domain/sessions'
import { requireMember, SESSION_COOKIE } from '@/lib/auth'
import { GET } from '@/app/login/[token]/route'
import { requestMagicLinkAction } from '@/app/actions/auth'
import LoginPage from '@/app/login/page'
import PendingPage from '@/app/login/pending/page'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

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

describe('Pending status blocking and login approval', () => {
  beforeEach(async () => {
    await resetDb()
    vi.clearAllMocks()
    delete process.env.RESEND_API_KEY
  })

  describe('loginWithInvite & getSessionMember with pending status', () => {
    it('allows pending member to log in with invite token', async () => {
      const res = await requestMemberAccess(testDb, 'pending-user@example.com', now)
      expect(res.ok).toBe(true)
      if (!res.ok) throw new Error(res.code)

      expect(res.value.member.status).toBe('pending')

      const loginResult = await loginWithInvite(testDb, res.value.inviteToken, now)
      expect(loginResult.ok).toBe(true)
      if (!loginResult.ok) throw new Error(loginResult.code)

      expect(loginResult.value.member.status).toBe('pending')
      expect(loginResult.value.sessionToken).toBeDefined()
    })

    it('retrieves pending member from getSessionMember', async () => {
      const res = await requestMemberAccess(testDb, 'pending-session@example.com', now)
      if (!res.ok) throw new Error(res.code)

      const loginResult = await loginWithInvite(testDb, res.value.inviteToken, now)
      if (!loginResult.ok) throw new Error(loginResult.code)

      const sessionMember = await getSessionMember(testDb, loginResult.value.sessionToken, now)
      expect(sessionMember).not.toBeNull()
      expect(sessionMember?.id).toBe(res.value.member.id)
      expect(sessionMember?.status).toBe('pending')
    })

    it('rejects disabled member from loginWithInvite and getSessionMember', async () => {
      const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
      const user = await createMember(testDb, { name: 'User' })

      await setMemberStatus(testDb, admin.id, user.member.id, 'disabled')

      const loginResult = await loginWithInvite(testDb, user.inviteToken, now)
      expect(loginResult.ok).toBe(false)
      if (!loginResult.ok) {
        expect(loginResult.code).toBe('DISABLED')
      }
    })
  })

  describe('Route GET /login/[token]', () => {
    it('redirects pending member to /login/pending and sets session cookie', async () => {
      const res = await requestMemberAccess(testDb, 'new-user@example.com', now)
      if (!res.ok) throw new Error(res.code)

      const req = new Request(`http://localhost:3000/login/${res.value.inviteToken}`)
      const response = await GET(req, {
        params: Promise.resolve({ token: res.value.inviteToken }),
      })

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/login/pending')
      const cookieHeader = response.cookies.get(SESSION_COOKIE)
      expect(cookieHeader).toBeDefined()
      expect(cookieHeader?.value).toBeTruthy()
    })

    it('redirects active member to / and sets session cookie', async () => {
      const { member, inviteToken } = await createMember(testDb, { name: 'ActiveUser' })
      expect(member.status).toBe('active')

      const req = new Request(`http://localhost:3000/login/${inviteToken}`)
      const response = await GET(req, {
        params: Promise.resolve({ token: inviteToken }),
      })

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/')
      const cookieHeader = response.cookies.get(SESSION_COOKIE)
      expect(cookieHeader).toBeDefined()
      expect(cookieHeader?.value).toBeTruthy()
    })

    it('redirects invalid token to /login/expired', async () => {
      const req = new Request('http://localhost:3000/login/non-existent-token')
      const response = await GET(req, {
        params: Promise.resolve({ token: 'non-existent-token' }),
      })

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/login/expired')
    })
  })

  describe('requireMember pending check', () => {
    it('redirects pending member to /login/pending', async () => {
      const res = await requestMemberAccess(testDb, 'guard-test@example.com', now)
      if (!res.ok) throw new Error(res.code)

      const loginResult = await loginWithInvite(testDb, res.value.inviteToken, now)
      if (!loginResult.ok) throw new Error(loginResult.code)

      mockSessionCookie(loginResult.value.sessionToken)

      await expect(requireMember()).rejects.toThrow('NEXT_REDIRECT:/login/pending')
      expect(redirect).toHaveBeenCalledWith('/login/pending')
    })

    it('allows active member through', async () => {
      const { member, inviteToken } = await createMember(testDb, { name: 'ActiveMember' })
      const loginResult = await loginWithInvite(testDb, inviteToken, now)
      if (!loginResult.ok) throw new Error(loginResult.code)

      mockSessionCookie(loginResult.value.sessionToken)

      const current = await requireMember()
      expect(current.id).toBe(member.id)
      expect(current.status).toBe('active')
    })
  })

  describe('requestMagicLinkAction', () => {
    it('rejects invalid email', async () => {
      const formData = new FormData()
      formData.set('email', 'not-valid')

      const result = await requestMagicLinkAction(null, formData)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INVALID_EMAIL')
      }
    })

    it('creates pending member and returns ok: true for valid new email', async () => {
      const formData = new FormData()
      formData.set('email', 'signup@example.com')

      const result = await requestMagicLinkAction(null, formData)
      expect(result).toEqual({ ok: true })

      const member = await testDb.query.members.findFirst({
        where: (m, { eq }) => eq(m.email, 'signup@example.com'),
      })
      expect(member).toBeDefined()
      expect(member?.status).toBe('pending')
    })

    it('creates pending member with profile fields forwarded via requestMagicLinkAction', async () => {
      const formData = new FormData()
      formData.set('email', 'fullprofile@example.com')
      formData.set('name', 'Full Profile User')
      formData.set('nickname', 'FullProfile')
      formData.set('phone', '+1 555 432 1098')
      formData.set('image', 'https://example.com/avatar.jpg')

      const result = await requestMagicLinkAction(null, formData)
      expect(result).toEqual({ ok: true })

      const member = await testDb.query.members.findFirst({
        where: (m, { eq }) => eq(m.email, 'fullprofile@example.com'),
      })
      expect(member).toBeDefined()
      expect(member?.name).toBe('Full Profile User')
      expect(member?.nickname).toBe('FullProfile')
      expect(member?.phone).toBe('+1 555 432 1098')
      expect(member?.image).toBe('https://example.com/avatar.jpg')
      expect(member?.status).toBe('pending')
    })
  })

  describe('LoginPage & PendingPage rendering & redirects', () => {
    it('LoginPage redirects pending member to /login/pending', async () => {
      const res = await requestMemberAccess(testDb, 'page-pending@example.com', now)
      if (!res.ok) throw new Error(res.code)
      const login = await loginWithInvite(testDb, res.value.inviteToken, now)
      if (!login.ok) throw new Error(login.code)

      mockSessionCookie(login.value.sessionToken)

      await expect(LoginPage()).rejects.toThrow('NEXT_REDIRECT:/login/pending')
      expect(redirect).toHaveBeenCalledWith('/login/pending')
    })

    it('LoginPage redirects active member to /', async () => {
      const { inviteToken } = await createMember(testDb, { name: 'PageActive' })
      const login = await loginWithInvite(testDb, inviteToken, now)
      if (!login.ok) throw new Error(login.code)

      mockSessionCookie(login.value.sessionToken)

      await expect(LoginPage()).rejects.toThrow('NEXT_REDIRECT:/')
      expect(redirect).toHaveBeenCalledWith('/')
    })

    it('LoginPage renders for unauthenticated visitors without redirecting', async () => {
      mockSessionCookie()

      const element = await LoginPage()
      expect(element).toBeDefined()
      expect(redirect).not.toHaveBeenCalled()
    })

    it('PendingPage redirects unauthenticated visitors to /login', async () => {
      mockSessionCookie()

      await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT:/login')
      expect(redirect).toHaveBeenCalledWith('/login')
    })

    it('PendingPage redirects active members to /', async () => {
      const { inviteToken } = await createMember(testDb, { name: 'ActiveOnPending' })
      const login = await loginWithInvite(testDb, inviteToken, now)
      if (!login.ok) throw new Error(login.code)

      mockSessionCookie(login.value.sessionToken)

      await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT:/')
      expect(redirect).toHaveBeenCalledWith('/')
    })

    it('PendingPage renders notice for pending member without redirecting', async () => {
      const res = await requestMemberAccess(testDb, 'pending-view@example.com', now)
      if (!res.ok) throw new Error(res.code)
      const login = await loginWithInvite(testDb, res.value.inviteToken, now)
      if (!login.ok) throw new Error(login.code)

      mockSessionCookie(login.value.sessionToken)

      const element = await PendingPage()
      expect(element).toBeDefined()
      expect(redirect).not.toHaveBeenCalled()
    })
  })
})
