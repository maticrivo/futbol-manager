import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb, resetDb } from '../db'
import { auditLog, loginTokens, members } from '@/db/schema'
import { hashToken } from '@/lib/tokens'
import { requestMagicLink, requestMemberAccess } from '@/domain/members'
import { clearSentEmails, sendMagicLinkEmail, sentEmails } from '@/lib/email'
import { eq } from 'drizzle-orm'

const now = new Date('2027-03-27T10:00:00Z')

describe('email integration & magic links', () => {
  beforeEach(async () => {
    await resetDb()
    clearSentEmails()
    vi.restoreAllMocks()
    delete process.env.RESEND_API_KEY
  })

  describe('sendMagicLinkEmail', () => {
    it('gracefully records sent email when RESEND_API_KEY is missing or in test', async () => {
      await sendMagicLinkEmail('player@example.com', 'http://localhost:3000/login/test-token')

      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toEqual(['player@example.com'])
      expect(sentEmails[0].html).toContain('http://localhost:3000/login/test-token')
    })

    it('handles raw token as second argument by formatting login URL', async () => {
      process.env.APP_URL = 'https://futbol.example.com'
      await sendMagicLinkEmail('player@example.com', 'abc123token')

      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toEqual(['player@example.com'])
      expect(sentEmails[0].html).toContain('https://futbol.example.com/login/abc123token')
    })

    it('calls Resend API when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 're_test_123456'
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email_123' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await sendMagicLinkEmail('user@test.com', 'http://localhost:3000/login/xyz')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.resend.com/emails')
      expect(options.method).toBe('POST')
      expect(options.headers['Authorization']).toBe('Bearer re_test_123456')
      expect(options.headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(options.body)
      expect(body.to).toEqual(['user@test.com'])
      expect(body.html).toContain('http://localhost:3000/login/xyz')
    })

    it('throws when Resend API returns an error response', async () => {
      process.env.RESEND_API_KEY = 're_test_fail'
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(
        sendMagicLinkEmail('user@test.com', 'http://localhost:3000/login/xyz')
      ).rejects.toThrow(/Resend email delivery failed/i)
    })
  })

  describe('requestMemberAccess & requestMagicLink', () => {
    it('rejects invalid email formats', async () => {
      const invalidEmails = ['', '   ', 'not-an-email', 'foo@', '@bar.com', 'a'.repeat(125) + '@test.com']
      for (const email of invalidEmails) {
        const res = await requestMemberAccess(testDb, email, now)
        expect(res.ok).toBe(false)
        if (!res.ok) {
          expect(res.code).toBe('INVALID_EMAIL')
        }
      }
    })

    it('creates a pending member and sends magic link email for new email', async () => {
      const res = await requestMemberAccess(testDb, 'newbie@example.com', now)
      expect(res.ok).toBe(true)
      if (!res.ok) throw new Error(res.code)

      expect(res.value.memberId).toBeGreaterThan(0)
      expect(res.value.inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

      // Verify member created with status: 'pending' and role: 'member'
      const [dbMember] = await testDb
        .select()
        .from(members)
        .where(eq(members.id, res.value.memberId))

      expect(dbMember).toBeDefined()
      expect(dbMember.name).toBe('newbie@example.com')
      expect(dbMember.role).toBe('member')
      expect(dbMember.status).toBe('pending')

      // Verify token created
      const tokens = await testDb
        .select()
        .from(loginTokens)
        .where(eq(loginTokens.memberId, res.value.memberId))

      expect(tokens).toHaveLength(1)
      expect(tokens[0].tokenHash).toBe(hashToken(res.value.inviteToken))
      expect(tokens[0].revokedAt).toBeNull()

      // Verify email was sent
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toEqual(['newbie@example.com'])
      expect(sentEmails[0].html).toContain(res.value.inviteToken)

      // Verify audit log
      const logs = await testDb
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, String(res.value.memberId)))

      expect(logs.some((l) => l.action === 'member.request_access')).toBe(true)
    })

    it('revokes previous tokens and generates new magic link for existing active member', async () => {
      // First access
      const first = await requestMemberAccess(testDb, 'active@example.com', now)
      if (!first.ok) throw new Error(first.code)

      // Manually set status to active
      await testDb
        .update(members)
        .set({ status: 'active' })
        .where(eq(members.id, first.value.memberId))

      clearSentEmails()

      const later = new Date(now.getTime() + 60_000)
      const second = await requestMemberAccess(testDb, 'Active@example.com ', later)
      expect(second.ok).toBe(true)
      if (!second.ok) throw new Error(second.code)

      // Same member ID
      expect(second.value.memberId).toBe(first.value.memberId)
      expect(second.value.inviteToken).not.toBe(first.value.inviteToken)

      // First token revoked, second token active
      const tokens = await testDb
        .select()
        .from(loginTokens)
        .where(eq(loginTokens.memberId, first.value.memberId))

      expect(tokens).toHaveLength(2)
      const revoked = tokens.find((t) => t.tokenHash === hashToken(first.value.inviteToken))
      const active = tokens.find((t) => t.tokenHash === hashToken(second.value.inviteToken))

      expect(revoked?.revokedAt).toBeDefined()
      expect(active?.revokedAt).toBeNull()

      // Email sent for second request
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].html).toContain(second.value.inviteToken)
    })

    it('works for existing pending and disabled members', async () => {
      // Create pending member
      const pRes = await requestMemberAccess(testDb, 'pending@example.com', now)
      if (!pRes.ok) throw new Error(pRes.code)

      clearSentEmails()
      const pRes2 = await requestMemberAccess(testDb, 'pending@example.com', now)
      expect(pRes2.ok).toBe(true)
      expect(sentEmails).toHaveLength(1)

      // Create and disable a member
      const dRes = await requestMemberAccess(testDb, 'disabled@example.com', now)
      if (!dRes.ok) throw new Error(dRes.code)
      await testDb
        .update(members)
        .set({ status: 'disabled' })
        .where(eq(members.id, dRes.value.memberId))

      clearSentEmails()
      const dRes2 = await requestMemberAccess(testDb, 'disabled@example.com', now)
      expect(dRes2.ok).toBe(true)
      expect(sentEmails).toHaveLength(1)

      const [disabledMember] = await testDb
        .select()
        .from(members)
        .where(eq(members.id, dRes.value.memberId))
      expect(disabledMember.status).toBe('disabled')
    })

    it('aliases requestMagicLink to requestMemberAccess', async () => {
      expect(requestMagicLink).toBe(requestMemberAccess)
    })
  })
})
