import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditLog, sessions, users } from '@/db/schema'
import {
  createMember,
  listMembers,
  setMemberStatus,
  toMember,
  updateMemberProfile,
} from '@/domain/members'
import { resetDb, testDb } from '../db'

const now = new Date('2027-03-27T10:00:00Z')

beforeEach(resetDb)

describe('createMember', () => {
  it('defaults to an active member with normalized profile fields and no invite token', async () => {
    const result = await createMember(testDb, {
      name: 'Alice',
      email: '  Alice@Example.COM  ',
      nickname: '  Ali  ',
      phone: '  +972 50 123 4567  ',
      image: '  https://example.com/avatar.png  ',
    })

    expect(result).not.toHaveProperty('inviteToken')
    expect(result.member.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.member.role).toBe('member')
    expect(result.member.status).toBe('active')
    expect(result.member.locale).toBe('en')
    expect(result.member.email).toBe('alice@example.com')
    expect(result.member.nickname).toBe('Ali')
    expect(result.member.phone).toBe('+972 50 123 4567')
    expect(result.member.image).toBe('https://example.com/avatar.png')

    const audits = await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.create'))
    expect(audits).toHaveLength(1)
    expect(audits[0].actorId).toBe(result.member.id)
    expect(audits[0].detail).toMatchObject({ name: 'Alice', email: 'alice@example.com' })
  })

  it('converts blank optional fields to null', async () => {
    const { member } = await createMember(testDb, {
      name: 'Bob',
      email: '   ',
      nickname: '',
      phone: '   ',
      image: '',
    })

    expect(member.email).toBeNull()
    expect(member.nickname).toBeNull()
    expect(member.phone).toBeNull()
    expect(member.image).toBeNull()
  })
})

describe('member listing and status', () => {
  it('orders by name and normalizes a missing name from the email', async () => {
    const [noName] = await testDb.insert(users).values({ email: 'no-name@example.com' }).returning()
    await createMember(testDb, { name: 'Zoe', email: 'zoe@example.com', role: 'admin', locale: 'he' })
    const cy = await createMember(testDb, { name: 'Cy', email: 'cy@example.com', locale: 'es' })

    const members = await listMembers(testDb)
    expect(members.map((member) => member.name)).toEqual(['Cy', 'no-name', 'Zoe'])
    expect(members.find((member) => member.id === cy.member.id)?.locale).toBe('es')
    expect(members.find((member) => member.id === noName.id)?.name).toBe('no-name')
    expect(toMember(noName).name).toBe('no-name')
  })

  it('deletes sessions when a member is disabled and preserves the deletion on re-enable', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member
    const target = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member
    await testDb.insert(sessions).values({ sessionToken: 'tok', userId: target.id, expires: now })

    expect(await setMemberStatus(testDb, admin.id, target.id, 'disabled')).toEqual({
      ok: true,
      value: expect.objectContaining({ id: target.id, status: 'disabled' }),
    })
    expect(await testDb.select().from(sessions)).toHaveLength(0)

    expect((await setMemberStatus(testDb, admin.id, target.id, 'active')).ok).toBe(true)
    expect(await testDb.select().from(sessions)).toHaveLength(0)
  })

  it('forbids self-disable and non-admin status changes', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member
    const member = (await createMember(testDb, { name: 'Member', email: 'member@example.com' })).member

    expect(await setMemberStatus(testDb, admin.id, admin.id, 'disabled')).toEqual({ ok: false, code: 'FORBIDDEN' })
    expect(await setMemberStatus(testDb, member.id, admin.id, 'disabled')).toEqual({ ok: false, code: 'FORBIDDEN' })
  })
})

describe('updateMemberProfile', () => {
  it('updates app-managed fields', async () => {
    const member = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member

    const result = await updateMemberProfile(testDb, {
      actorId: member.id,
      memberId: member.id,
      patch: { name: 'Renamed', nickname: 'Speedy', phone: '+1 555 123 4567' },
    }, now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.code)
    expect(result.value.name).toBe('Renamed')
    expect(result.value.nickname).toBe('Speedy')
    expect(result.value.phone).toBe('+1 555 123 4567')
  })

  it('rejects a differing email but allows the current email', async () => {
    const member = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member

    const changed = await updateMemberProfile(testDb, {
      actorId: member.id,
      memberId: member.id,
      patch: { email: 'other@example.com' },
    }, now)
    expect(changed).toEqual({ ok: false, code: 'INVALID_EMAIL' })

    const same = await updateMemberProfile(testDb, {
      actorId: member.id,
      memberId: member.id,
      patch: { email: 'PLAYER@example.com' },
    }, now)
    expect(same.ok).toBe(true)
  })
})
