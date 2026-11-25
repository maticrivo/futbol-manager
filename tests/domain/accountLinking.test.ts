import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { accounts, auditLog, notificationPrefs, sessions, users } from '@/db/schema'
import { createMember, linkPendingMemberToMember } from '@/domain/members'
import { resetDb, testDb } from '../db'

beforeEach(resetDb)

describe('linkPendingMemberToMember', () => {
  it('moves provider accounts, removes the pending row and setup data, and audits the link', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', email: 'a@example.com', role: 'admin' })).member
    const target = (await createMember(testDb, { name: 'Target', email: 't@example.com' })).member
    const pending = (await createMember(testDb, { name: 'Duplicate', email: 'd@example.com', status: 'pending' })).member
    await testDb.insert(accounts).values({ userId: pending.id, type: 'oauth', provider: 'facebook', providerAccountId: 'fb-1' })
    await testDb.insert(sessions).values({ sessionToken: 'dup', userId: pending.id, expires: new Date() })
    await testDb.insert(notificationPrefs).values({ memberId: pending.id, category: 'bill_ready' })

    const result = await linkPendingMemberToMember(testDb, {
      actorId: admin.id, pendingId: pending.id, targetId: target.id,
    })

    expect(result.ok).toBe(true)
    expect(await testDb.select().from(users).where(eq(users.id, pending.id))).toHaveLength(0)
    const [account] = await testDb.select().from(accounts)
    expect(account.userId).toBe(target.id)
    expect(await testDb.select().from(sessions)).toHaveLength(0)
    expect(await testDb.select().from(notificationPrefs)).toHaveLength(0)
    const [audit] = await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.link_account'))
    expect(audit.detail).toMatchObject({ pendingId: pending.id, targetId: target.id, providers: ['facebook'] })
  })

  it('rejects non-admins, non-pending sources, inactive targets, and self-links', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', email: 'a@example.com', role: 'admin' })).member
    const member = (await createMember(testDb, { name: 'Member', email: 'm@example.com' })).member
    const pending = (await createMember(testDb, { name: 'Pending', email: 'p@example.com', status: 'pending' })).member
    const disabled = (await createMember(testDb, { name: 'Disabled', email: 'd@example.com' })).member
    await testDb.update(users).set({ status: 'disabled' }).where(eq(users.id, disabled.id))

    expect(await linkPendingMemberToMember(testDb, {
      actorId: member.id, pendingId: pending.id, targetId: member.id,
    })).toEqual({ ok: false, code: 'FORBIDDEN' })

    expect(await linkPendingMemberToMember(testDb, {
      actorId: admin.id, pendingId: member.id, targetId: admin.id,
    })).toEqual({ ok: false, code: 'NOT_PENDING' })

    expect(await linkPendingMemberToMember(testDb, {
      actorId: admin.id, pendingId: pending.id, targetId: disabled.id,
    })).toEqual({ ok: false, code: 'TARGET_NOT_ACTIVE' })

    expect(await linkPendingMemberToMember(testDb, {
      actorId: admin.id, pendingId: pending.id, targetId: pending.id,
    })).toEqual({ ok: false, code: 'SAME_MEMBER' })
  })
})
