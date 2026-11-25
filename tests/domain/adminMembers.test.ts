import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { sessions } from '@/db/schema'
import { testDb, resetDb } from '../db'
import { getAuditLog, writeAudit } from '@/domain/audit'
import { createMember, listMembers, setMemberStatus } from '@/domain/members'

beforeEach(resetDb)

it('listMembers returns name-ordered members including a disabled member with role/status/locale', async () => {
  const admin = (await createMember(testDb, { name: 'Zoe', email: 'zoe@example.com', role: 'admin', locale: 'he' })).member
  await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })
  const cy = (await createMember(testDb, { name: 'Cy', email: 'cy@example.com', locale: 'es' })).member

  await setMemberStatus(testDb, admin.id, cy.id, 'disabled')

  const members = await listMembers(testDb)
  expect(members.map((m) => m.name)).toEqual(['Ana', 'Cy', 'Zoe'])

  const cyRow = members.find((m) => m.name === 'Cy')!
  expect(cyRow.status).toBe('disabled')
  expect(cyRow.role).toBe('member')
  expect(cyRow.locale).toBe('es')

  const anaRow = members.find((m) => m.name === 'Ana')!
  expect(anaRow.role).toBe('member')
  expect(anaRow.status).toBe('active')
  expect(anaRow.locale).toBe('en')

  const zoeRow = members.find((m) => m.name === 'Zoe')!
  expect(zoeRow.role).toBe('admin')
  expect(zoeRow.createdAt).toBeInstanceOf(Date)
})

it('getAuditLog returns newest first with actor names and a null actor name for a null actor', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member

  await writeAudit(testDb, {
    actorId: admin.id, action: 'a.one', entity: 'x', entityId: '1', createdAt: new Date('2027-01-01T00:00:00Z'),
  })
  await writeAudit(testDb, {
    action: 'system.two', entity: 'y', createdAt: new Date('2027-01-02T00:00:00Z'),
  })
  await writeAudit(testDb, {
    actorId: admin.id, action: 'a.three', entity: 'z', createdAt: new Date('2027-01-03T00:00:00Z'),
  })

  const log = await getAuditLog(testDb)
  const mine = log.filter((e) => ['a.one', 'system.two', 'a.three'].includes(e.action))
  expect(mine.map((e) => e.action)).toEqual(['a.three', 'system.two', 'a.one'])

  expect(log.find((e) => e.action === 'a.three')!.actorName).toBe('Admin')
  expect(log.find((e) => e.action === 'system.two')!.actorName).toBeNull()
})

it('getAuditLog clamps the limit to 1..200', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member

  for (let i = 0; i < 5; i++) {
    await writeAudit(testDb, { actorId: admin.id, action: `clamp.${i}`, entity: 'x' })
  }

  expect(await getAuditLog(testDb, 0)).toHaveLength(1)
  expect(await getAuditLog(testDb, 2)).toHaveLength(2)
  expect(await getAuditLog(testDb, 1000)).toHaveLength(6)
})

it('an admin cannot disable themselves, but can disable and re-enable another member', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Other', email: 'other@example.com' })).member

  expect(await setMemberStatus(testDb, admin.id, admin.id, 'disabled')).toEqual({ ok: false, code: 'FORBIDDEN' })

  expect((await setMemberStatus(testDb, admin.id, other.id, 'disabled')).ok).toBe(true)
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('disabled')

  expect((await setMemberStatus(testDb, admin.id, other.id, 'active')).ok).toBe(true)
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('active')
})

it('revokes Auth.js sessions when a member is disabled and preserves revocation upon re-enabling', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member
  const token = 'test-session-token'
  await testDb.insert(sessions).values({ sessionToken: token, userId: target.id, expires: new Date('2028-01-01T00:00:00Z') })

  expect(await testDb.select().from(sessions).where(eq(sessions.userId, target.id))).toHaveLength(1)

  const disableResult = await setMemberStatus(testDb, admin.id, target.id, 'disabled')
  expect(disableResult.ok).toBe(true)

  expect(await testDb.select().from(sessions).where(eq(sessions.userId, target.id))).toEqual([])

  expect((await setMemberStatus(testDb, admin.id, target.id, 'active')).ok).toBe(true)
  expect(await testDb.select().from(sessions).where(eq(sessions.userId, target.id))).toEqual([])
})

it('admin can approve a pending member and cannot set themselves to pending', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member
  const pending = (await createMember(testDb, { name: 'Pending Player', email: 'pending@example.com', status: 'pending' })).member
  expect(pending.status).toBe('pending')

  const selfPending = await setMemberStatus(testDb, admin.id, admin.id, 'pending')
  expect(selfPending).toEqual({ ok: false, code: 'FORBIDDEN' })

  const approveResult = await setMemberStatus(testDb, admin.id, pending.id, 'active')
  expect(approveResult.ok).toBe(true)
  expect((await listMembers(testDb)).find((m) => m.id === pending.id)!.status).toBe('active')

  const toPendingResult = await setMemberStatus(testDb, admin.id, pending.id, 'pending')
  expect(toPendingResult.ok).toBe(true)
  expect((await listMembers(testDb)).find((m) => m.id === pending.id)!.status).toBe('pending')
})
