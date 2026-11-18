import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { getAuditLog, writeAudit } from '@/domain/audit'
import { createMember, listMembers, loginWithInvite, regenerateInvite, setMemberStatus } from '@/domain/members'

const now = new Date('2027-03-27T10:00:00Z')

beforeEach(resetDb)

it('listMembers returns name-ordered members including a disabled member with role/status/locale', async () => {
  const admin = (await createMember(testDb, { name: 'Zoe', role: 'admin', locale: 'he' })).member
  await createMember(testDb, { name: 'Ana' })
  const cy = (await createMember(testDb, { name: 'Cy', locale: 'es' })).member

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
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member

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
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member

  for (let i = 0; i < 5; i++) {
    await writeAudit(testDb, { actorId: admin.id, action: `clamp.${i}`, entity: 'x' })
  }

  expect(await getAuditLog(testDb, 0)).toHaveLength(1)
  expect(await getAuditLog(testDb, 2)).toHaveLength(2)
  // 5 clamp entries + 1 member.create audit from createMember.
  expect(await getAuditLog(testDb, 1000)).toHaveLength(6)
})

it('an admin cannot disable themselves, but can disable and re-enable another member', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Other' })).member

  expect(await setMemberStatus(testDb, admin.id, admin.id, 'disabled')).toEqual({ ok: false, code: 'FORBIDDEN' })

  expect((await setMemberStatus(testDb, admin.id, other.id, 'disabled')).ok).toBe(true)
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('disabled')

  expect((await setMemberStatus(testDb, admin.id, other.id, 'active')).ok).toBe(true)
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('active')
})

it('non-admin cannot regenerate an invite', async () => {
  const member = (await createMember(testDb, { name: 'Member' })).member
  const target = (await createMember(testDb, { name: 'Target' })).member

  expect(await regenerateInvite(testDb, member.id, target.id)).toEqual({ ok: false, code: 'FORBIDDEN' })
})

it('admin regeneration invalidates the old token and the new token logs in', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const target = await createMember(testDb, { name: 'Target' })

  const regen = await regenerateInvite(testDb, admin.id, target.member.id)
  if (!regen.ok) throw new Error(regen.code)
  expect(regen.value.inviteToken).not.toBe(target.inviteToken)

  expect(await loginWithInvite(testDb, target.inviteToken, now)).toEqual({ ok: false, code: 'INVALID_TOKEN' })
  expect((await loginWithInvite(testDb, regen.value.inviteToken, now)).ok).toBe(true)
})
