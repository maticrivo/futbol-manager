import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditLog, members } from '@/db/schema'
import {
  createMember,
  requestMemberAccess,
  updateMemberProfile,
} from '@/domain/members'
import { testDb, resetDb } from '../db'
import { waitForLockWait } from '../lock-wait'

const now = new Date('2027-03-27T10:00:00Z')

beforeEach(resetDb)

describe('createMember with extended profile fields', () => {
  it('stores normalized email, nickname, phone, and image, converting blank strings to null', async () => {
    const { member } = await createMember(testDb, {
      name: 'Alice',
      email: '  Alice@Example.COM  ',
      nickname: '  Ali  ',
      phone: '  +972 50 123 4567  ',
      image: '  https://example.com/avatar.png  ',
    })

    expect(member.name).toBe('Alice')
    expect(member.email).toBe('alice@example.com')
    expect(member.nickname).toBe('Ali')
    expect(member.phone).toBe('+972 50 123 4567')
    expect(member.image).toBe('https://example.com/avatar.png')

    // Blank fields converted to null
    const { member: blankMember } = await createMember(testDb, {
      name: 'Bob',
      email: '   ',
      nickname: '',
      phone: '   ',
      image: '',
    })

    expect(blankMember.email).toBeNull()
    expect(blankMember.nickname).toBeNull()
    expect(blankMember.phone).toBeNull()
    expect(blankMember.image).toBeNull()
  })

  it('includes email in member.create audit log', async () => {
    const { member } = await createMember(testDb, {
      name: 'Charlie',
      email: 'Charlie@Example.com',
    })

    const audits = await testDb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'member.create'), eq(auditLog.entityId, String(member.id))))

    expect(audits).toHaveLength(1)
    expect(audits[0].detail).toMatchObject({
      name: 'Charlie',
      email: 'charlie@example.com',
    })
  })
})

describe('updateMemberProfile authorization', () => {
  it('allows an admin to edit any member', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const member = (await createMember(testDb, { name: 'Player' })).member

    const res = await updateMemberProfile(
      testDb,
      {
        actorId: admin.id,
        memberId: member.id,
        patch: { name: 'Updated Player', nickname: 'Champ' },
      },
      now
    )

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.code)
    expect(res.value.name).toBe('Updated Player')
    expect(res.value.nickname).toBe('Champ')
  })

  it('allows a member to edit their own profile', async () => {
    const member = (await createMember(testDb, { name: 'Player' })).member

    const res = await updateMemberProfile(
      testDb,
      {
        actorId: member.id,
        memberId: member.id,
        patch: { nickname: 'Speedy' },
      },
      now
    )

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.code)
    expect(res.value.nickname).toBe('Speedy')
    expect(res.value.name).toBe('Player')
  })

  it('forbids a regular member from editing another member', async () => {
    const memberA = (await createMember(testDb, { name: 'Alice' })).member
    const memberB = (await createMember(testDb, { name: 'Bob' })).member

    const res = await updateMemberProfile(
      testDb,
      {
        actorId: memberA.id,
        memberId: memberB.id,
        patch: { name: 'Hacked Bob' },
      },
      now
    )

    expect(res).toEqual({ ok: false, code: 'FORBIDDEN' })

    const [unchanged] = await testDb.select().from(members).where(eq(members.id, memberB.id))
    expect(unchanged.name).toBe('Bob')
  })

  it('returns NOT_FOUND when admin edits a non-existent member', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member

    const res = await updateMemberProfile(
      testDb,
      {
        actorId: admin.id,
        memberId: 99999,
        patch: { name: 'Nobody' },
      },
      now
    )

    expect(res).toEqual({ ok: false, code: 'NOT_FOUND' })
  })

  it('returns FORBIDDEN when actor does not exist', async () => {
    const member = (await createMember(testDb, { name: 'Player' })).member

    const res = await updateMemberProfile(
      testDb,
      {
        actorId: 99999,
        memberId: member.id,
        patch: { name: 'Ghost' },
      },
      now
    )

    expect(res).toEqual({ ok: false, code: 'FORBIDDEN' })
  })
})

describe('updateMemberProfile validation', () => {
  it('validates name: required, 1-120 chars, trimmed', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const target = (await createMember(testDb, { name: 'Player' })).member

    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { name: '' },
      })
    ).toEqual({ ok: false, code: 'INVALID_NAME' })

    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { name: '    ' },
      })
    ).toEqual({ ok: false, code: 'INVALID_NAME' })

    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { name: 'a'.repeat(121) },
      })
    ).toEqual({ ok: false, code: 'INVALID_NAME' })

    const validRes = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: target.id,
      patch: { name: '  Valid Name  ' },
    })
    expect(validRes.ok).toBe(true)
    if (!validRes.ok) throw new Error(validRes.code)
    expect(validRes.value.name).toBe('Valid Name')
  })

  it('validates nickname: <= 60 chars, blank becomes null', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const target = (await createMember(testDb, { name: 'Player', nickname: 'OldNick' })).member

    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { nickname: 'x'.repeat(61) },
      })
    ).toEqual({ ok: false, code: 'INVALID_NAME' })

    const blankRes = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: target.id,
      patch: { nickname: '   ' },
    })
    expect(blankRes.ok).toBe(true)
    if (!blankRes.ok) throw new Error(blankRes.code)
    expect(blankRes.value.nickname).toBeNull()
  })

  it('validates phone: digits and allowed formatting chars, >= 5 digits, <= 40 chars, blank becomes null', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const target = (await createMember(testDb, { name: 'Player', phone: '+972-50-1234567' })).member

    // Rejects letters
    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { phone: '12345abc' },
      })
    ).toEqual({ ok: false, code: 'INVALID_PHONE' })

    // Rejects fewer than 5 digits
    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { phone: '1234' },
      })
    ).toEqual({ ok: false, code: 'INVALID_PHONE' })

    // Rejects > 40 chars
    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { phone: '1'.repeat(41) },
      })
    ).toEqual({ ok: false, code: 'INVALID_PHONE' })

    // Accepts valid international format
    const valid = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: target.id,
      patch: { phone: '+1 (555) 012-3456' },
    })
    expect(valid.ok).toBe(true)
    if (!valid.ok) throw new Error(valid.code)
    expect(valid.value.phone).toBe('+1 (555) 012-3456')

    // Blank becomes null
    const blank = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: target.id,
      patch: { phone: '' },
    })
    expect(blank.ok).toBe(true)
    if (!blank.ok) throw new Error(blank.code)
    expect(blank.value.phone).toBeNull()
  })

  it('validates image: must be http/https URL, <= 500 chars, blank becomes null', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const target = (await createMember(testDb, { name: 'Player' })).member

    // Rejects non-http(s)
    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { image: 'ftp://example.com/pic.jpg' },
      })
    ).toEqual({ ok: false, code: 'INVALID_IMAGE' })

    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { image: 'not-a-url' },
      })
    ).toEqual({ ok: false, code: 'INVALID_IMAGE' })

    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: target.id,
        patch: { image: 'https://' + 'a'.repeat(2_000_001) },
      })
    ).toEqual({ ok: false, code: 'INVALID_IMAGE' })

    const valid = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: target.id,
      patch: { image: 'https://example.com/photo.jpg' },
    })
    expect(valid.ok).toBe(true)
    if (!valid.ok) throw new Error(valid.code)
    expect(valid.value.image).toBe('https://example.com/photo.jpg')

    const blank = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: target.id,
      patch: { image: '   ' },
    })
    expect(blank.ok).toBe(true)
    if (!blank.ok) throw new Error(blank.code)
    expect(blank.value.image).toBeNull()
  })

  it('validates email: RFC format, rejects duplicates with EMAIL_TAKEN, allows same member to keep email', async () => {
    const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
    const member1 = (await createMember(testDb, { name: 'M1', email: 'one@example.com' })).member
    await createMember(testDb, { name: 'M2', email: 'two@example.com' })

    // Invalid format
    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: member1.id,
        patch: { email: 'invalid-email' },
      })
    ).toEqual({ ok: false, code: 'INVALID_EMAIL' })

    // Duplicate email
    expect(
      await updateMemberProfile(testDb, {
        actorId: admin.id,
        memberId: member1.id,
        patch: { email: 'TWO@example.com' },
      })
    ).toEqual({ ok: false, code: 'EMAIL_TAKEN' })

    // Same member keeping own email succeeds
    const same = await updateMemberProfile(testDb, {
      actorId: member1.id,
      memberId: member1.id,
      patch: { email: 'one@example.com' },
    })
    expect(same.ok).toBe(true)

    // An existing email is the login identity and cannot be cleared
    expect(
      await updateMemberProfile(testDb, {
        actorId: member1.id,
        memberId: member1.id,
        patch: { email: '' },
      })
    ).toEqual({ ok: false, code: 'INVALID_EMAIL' })

    // Email is mandatory when patched
    const legacy = (
      await createMember(testDb, { name: 'Legacy Player' })
    ).member
    const legacyBlank = await updateMemberProfile(testDb, {
      actorId: admin.id,
      memberId: legacy.id,
      patch: { email: '   ' },
    })
    expect(legacyBlank).toEqual({ ok: false, code: 'INVALID_EMAIL' })
  })
})

describe('updateMemberProfile audit and selective update', () => {
  it('updates only provided fields and writes audit with only changed field names (no values)', async () => {
    const admin = (await createMember(testDb, {
      name: 'Admin',
      role: 'admin',
    })).member
    const target = (await createMember(testDb, {
      name: 'Original Name',
      email: 'orig@example.com',
      nickname: 'OldNick',
      phone: '+1 555 123 4567',
      image: 'https://example.com/old.png',
    })).member

    const res = await updateMemberProfile(
      testDb,
      {
        actorId: admin.id,
        memberId: target.id,
        patch: {
          nickname: 'NewNick',
          phone: '+1 555 987 6543',
        },
      },
      now
    )

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.code)
    expect(res.value.name).toBe('Original Name')
    expect(res.value.email).toBe('orig@example.com')
    expect(res.value.nickname).toBe('NewNick')
    expect(res.value.phone).toBe('+1 555 987 6543')
    expect(res.value.image).toBe('https://example.com/old.png')

    // Check audit log
    const audits = await testDb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'member.profile_update'), eq(auditLog.entityId, String(target.id))))

    expect(audits).toHaveLength(1)
    expect(audits[0].actorId).toBe(admin.id)
    // Audit must contain changed field names only, never values
    expect(audits[0].detail).toEqual({ fields: expect.arrayContaining(['nickname', 'phone']) })
    expect(JSON.stringify(audits[0].detail)).not.toContain('NewNick')
    expect(JSON.stringify(audits[0].detail)).not.toContain('987')
  })
})

describe('requestMemberAccess profile creation and legacy lookup', () => {
  it('creates new pending member with profile fields and defaults name to email local part if omitted', async () => {
    // 1. Without profile name
    const res1 = await requestMemberAccess(testDb, 'john.doe@example.com', now, {
      nickname: 'JD',
      phone: '+1 555 111 2222',
      image: 'https://example.com/jd.png',
    })
    expect(res1.ok).toBe(true)
    if (!res1.ok) throw new Error(res1.code)

    const [member1] = await testDb.select().from(members).where(eq(members.id, res1.value.memberId))
    expect(member1.email).toBe('john.doe@example.com')
    expect(member1.name).toBe('john.doe')
    expect(member1.nickname).toBe('JD')
    expect(member1.phone).toBe('+1 555 111 2222')
    expect(member1.image).toBe('https://example.com/jd.png')
    expect(member1.status).toBe('pending')
    expect(member1.role).toBe('member')

    // 2. With profile name
    const res2 = await requestMemberAccess(testDb, 'jane@example.com', now, {
      name: 'Jane Smith',
      nickname: 'Jane',
    })
    expect(res2.ok).toBe(true)
    if (!res2.ok) throw new Error(res2.code)

    const [member2] = await testDb.select().from(members).where(eq(members.id, res2.value.memberId))
    expect(member2.email).toBe('jane@example.com')
    expect(member2.name).toBe('Jane Smith')
    expect(member2.nickname).toBe('Jane')
  })

  it('legacy lookup by name finds member and NEVER overwrites their existing profile', async () => {
    // Member created historically with name = email, but email column is null
    const legacy = (await createMember(testDb, {
      name: 'legacy@example.com',
      nickname: 'OriginalLegacy',
    })).member

    // Set email to null to simulate legacy row before schema backfill
    await testDb.update(members).set({ email: null }).where(eq(members.id, legacy.id))

    const res = await requestMemberAccess(testDb, 'legacy@example.com', now, {
      name: 'Attempted Overwrite Name',
      nickname: 'Attempted Overwrite Nick',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.code)
    expect(res.value.memberId).toBe(legacy.id)

    // Existing profile must be intact
    const [reloaded] = await testDb.select().from(members).where(eq(members.id, legacy.id))
    expect(reloaded.name).toBe('legacy@example.com')
    expect(reloaded.nickname).toBe('OriginalLegacy')
  })
})

describe('requestMemberAccess races and legacy lookup', () => {
  it('issues one member when two requests race for the same new email', async () => {
    // EXCLUSIVE blocks both transactions at their first locking read, so both
    // reach the insert having seen no row. Releasing lets them race for real.
    const holder = await testDb.$client.connect()
    let a: Awaited<ReturnType<typeof requestMemberAccess>> | undefined
    let b: Awaited<ReturnType<typeof requestMemberAccess>> | undefined
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE members IN EXCLUSIVE MODE')

      const pa = requestMemberAccess(testDb, 'race@example.com', now)
      const pb = requestMemberAccess(testDb, 'race@example.com', now)
      void pa.catch(() => {})
      void pb.catch(() => {})

      await waitForLockWait('from "members"', 3000, 2)
      await holder.query('COMMIT')

      ;[a, b] = await Promise.all([pa, pb])
    } finally {
      await holder.query('ROLLBACK').catch(() => {})
      holder.release()
    }

    expect(a?.ok).toBe(true)
    expect(b?.ok).toBe(true)
    if (!a?.ok || !b?.ok) throw new Error('expected both requests to succeed')
    expect(a.value.memberId).toBe(b.value.memberId)
    const rows = await testDb.select().from(members).where(eq(members.email, 'race@example.com'))
    expect(rows).toHaveLength(1)
  })

  it('legacy lookup by name is case-insensitive', async () => {
    const legacy = (await createMember(testDb, { name: 'Bob@Example.com' })).member
    await testDb.update(members).set({ email: null }).where(eq(members.id, legacy.id))

    const res = await requestMemberAccess(testDb, 'bob@example.com', now)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.code)
    expect(res.value.memberId).toBe(legacy.id)
    const rows = await testDb.select().from(members)
    expect(rows).toHaveLength(1)
  })
})
