import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, users } from '@/db/schema'
import {
  authorizeOAuthSignIn,
  isConfiguredAdminEmail,
  normalizeOAuthIdentity,
  onCreateOAuthUser,
  onLinkOAuthAccount,
  onOAuthSignIn,
} from '@/domain/oauth'
import { resetDb, testDb } from '../db'

const originalAdminEmail = process.env.ADMIN_EMAIL

beforeEach(async () => {
  await resetDb()
  delete process.env.ADMIN_EMAIL
})

afterEach(() => {
  if (originalAdminEmail === undefined) {
    delete process.env.ADMIN_EMAIL
  } else {
    process.env.ADMIN_EMAIL = originalAdminEmail
  }
})

describe('normalizeOAuthIdentity', () => {
  it('rejects a provider profile without an email', () => {
    expect(normalizeOAuthIdentity({ name: 'Phone User', email: null })).toBeNull()
    expect(normalizeOAuthIdentity({ name: 'Phone User', email: '   ' })).toBeNull()
  })

  it('lowercases email and fills a missing name from the email local part', () => {
    expect(normalizeOAuthIdentity({ name: '  ', email: ' A@Example.COM ' })).toEqual({
      name: 'a',
      email: 'a@example.com',
    })
  })
})

describe('authorizeOAuthSignIn', () => {
  it('allows pending, rejects disabled, and resolves an existing account by id', async () => {
    const [pending] = await testDb.insert(users).values({ name: 'P', email: 'p@example.com', status: 'pending' }).returning()
    const [disabled] = await testDb.insert(users).values({ name: 'D', email: 'd@example.com', status: 'disabled' }).returning()

    expect(await authorizeOAuthSignIn(testDb, { email: pending.email! })).toBe(true)
    expect(await authorizeOAuthSignIn(testDb, { id: disabled.id, email: 'changed@example.com' })).toBe(false)
  })

  it('promotes the configured admin email on an existing user', async () => {
    process.env.ADMIN_EMAIL = 'boss@example.com'
    const [admin] = await testDb.insert(users).values({ name: 'Boss', email: 'boss@example.com', status: 'pending' }).returning()

    expect(await authorizeOAuthSignIn(testDb, { email: admin.email! })).toBe(true)

    const [promoted] = await testDb.select().from(users).where(eq(users.id, admin.id))
    expect(promoted.role).toBe('admin')
    expect(promoted.status).toBe('active')
  })

  it('does not promote a non-configured email', () => {
    process.env.ADMIN_EMAIL = 'boss@example.com'
    expect(isConfiguredAdminEmail('other@example.com')).toBe(false)
    expect(isConfiguredAdminEmail(' BOSS@example.com ')).toBe(true)
  })
})

describe('Auth.js events', () => {
  it('promotes a newly created configured admin and audits the request', async () => {
    process.env.ADMIN_EMAIL = 'boss@example.com'
    const [created] = await testDb.insert(users).values({ name: 'Boss', email: 'boss@example.com' }).returning()

    await onCreateOAuthUser(testDb, created)

    const [promoted] = await testDb.select().from(users).where(eq(users.id, created.id))
    expect(promoted.role).toBe('admin')
    expect(promoted.status).toBe('active')
    const [audit] = await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.request_access'))
    expect(audit.actorId).toBe(created.id)
  })

  it('writes sign-in and link audit rows', async () => {
    const [user] = await testDb.insert(users).values({ name: 'Ana', email: 'ana@example.com' }).returning()

    await onOAuthSignIn(testDb, { id: user.id, provider: 'google' })
    await onLinkOAuthAccount(testDb, { userId: user.id, provider: 'google' })

    const rows = await testDb.select().from(auditLog)
    expect(rows.map((row) => row.action).sort()).toEqual(['auth.login', 'member.link_account'])
    expect(rows.find((row) => row.action === 'member.link_account')?.detail).toMatchObject({ provider: 'google' })
  })
})
