import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { waitForLockWait } from '../lock-wait'
import {
  createMember,
  loginWithInvite,
  regenerateInvite,
  revokeSessions,
  setMemberStatus,
} from '@/domain/members'
import { getSessionMember } from '@/domain/sessions'
import { auditLog, loginTokens, members, sessions } from '@/db/schema'
import { hashToken } from '@/lib/tokens'
import { eq } from 'drizzle-orm'

const now = new Date('2027-03-27T10:00:00Z')
beforeEach(resetDb)

it('logs in with a personal link, storing only a hash', async () => {
  const { member, inviteToken } = await createMember(testDb, { name: 'Ana' })
  const rows = await testDb.select().from(loginTokens)
  expect(rows[0].tokenHash).not.toBe(inviteToken)
  const login = await loginWithInvite(testDb, inviteToken, now)
  if (!login.ok) throw new Error(login.code)
  expect(login.value.member.id).toBe(member.id)

  // Verify stored session hash differs from the raw session token and matches hashToken
  const sessionRows = await testDb.select().from(sessions).where(eq(sessions.memberId, member.id))
  expect(sessionRows).toHaveLength(1)
  expect(sessionRows[0].tokenHash).not.toBe(login.value.sessionToken)
  expect(sessionRows[0].tokenHash).toBe(hashToken(login.value.sessionToken))

  expect((await getSessionMember(testDb, login.value.sessionToken, now))?.id).toBe(member.id)
})

it('rejects a regenerated-away link, a disabled member and an expired session', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const { member, inviteToken } = await createMember(testDb, { name: 'Bo' })
  await regenerateInvite(testDb, admin.id, member.id)
  expect((await loginWithInvite(testDb, inviteToken, now)).ok).toBe(false)

  const target = await createMember(testDb, { name: 'Cy' })
  await setMemberStatus(testDb, admin.id, target.member.id, 'disabled')
  expect((await loginWithInvite(testDb, target.inviteToken, now)).ok).toBe(false)

  const active = await createMember(testDb, { name: 'Di' })
  const login = await loginWithInvite(testDb, active.inviteToken, now)
  if (!login.ok) throw new Error(login.code)

  // Accepted immediately before 365-day cutoff and rejected exactly at it
  const sessionLifetimeMs = 365 * 24 * 3600_000
  const cutoff = new Date(now.getTime() + sessionLifetimeMs)
  const justBeforeCutoff = new Date(cutoff.getTime() - 1)
  expect((await getSessionMember(testDb, login.value.sessionToken, justBeforeCutoff))?.id).toBe(active.member.id)
  expect(await getSessionMember(testDb, login.value.sessionToken, cutoff)).toBeNull()

  const later = new Date(now.getTime() + 366 * 24 * 3600_000)
  expect(await getSessionMember(testDb, login.value.sessionToken, later)).toBeNull()
})

it('createMember defaults role to member, locale to en, and audits member.create', async () => {
  const { member, inviteToken } = await createMember(testDb, { name: 'Elena' })
  expect(member.role).toBe('member')
  expect(member.locale).toBe('en')
  expect(member.status).toBe('active')

  // Token is 43 chars base64url
  expect(inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

  // Audit log check
  const audits = await testDb.select().from(auditLog).where(eq(auditLog.entityId, String(member.id)))
  expect(audits).toHaveLength(1)
  expect(audits[0].action).toBe('member.create')
  expect(audits[0].actorId).toBe(member.id)
  expect(JSON.stringify(audits[0].detail)).not.toContain(inviteToken)
})

it('regenerateInvite requires admin, revokes old tokens, deletes active sessions, and returns new invite token', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const nonAdmin = (await createMember(testDb, { name: 'User' })).member
  const target = await createMember(testDb, { name: 'Target' })

  // Non-admin cannot regenerate
  const forbidden = await regenerateInvite(testDb, nonAdmin.id, target.member.id)
  expect(forbidden).toEqual({ ok: false, code: 'FORBIDDEN' })

  // Non-existent target
  const notFound = await regenerateInvite(testDb, admin.id, 999999)
  expect(notFound).toEqual({ ok: false, code: 'NOT_FOUND' })

  // Log in target member first to create an active session
  const login1 = await loginWithInvite(testDb, target.inviteToken, now)
  if (!login1.ok) throw new Error(login1.code)
  expect(await getSessionMember(testDb, login1.value.sessionToken, now)).not.toBeNull()

  // Regenerate invite
  const regenTime = new Date('2027-03-27T12:00:00Z')
  const regen = await regenerateInvite(testDb, admin.id, target.member.id, regenTime)
  if (!regen.ok) throw new Error(regen.code)
  expect(regen.value.inviteToken).not.toBe(target.inviteToken)

  // Old session is immediately deleted/revoked
  expect(await getSessionMember(testDb, login1.value.sessionToken, regenTime)).toBeNull()

  // Old invite token is revoked and cannot be used
  const oldLogin = await loginWithInvite(testDb, target.inviteToken, regenTime)
  expect(oldLogin).toEqual({ ok: false, code: 'INVALID_TOKEN' })

  // Old invite token was logged in at `now`, so its lastUsedAt remains `now` and is not updated to `regenTime`
  const oldTokens = await testDb.select().from(loginTokens).where(eq(loginTokens.tokenHash, hashToken(target.inviteToken)))
  expect(oldTokens[0].lastUsedAt).toEqual(now)

  // New invite token works
  const newLogin = await loginWithInvite(testDb, regen.value.inviteToken, regenTime)
  expect(newLogin.ok).toBe(true)
})

it('loginWithInvite returns INVALID_TOKEN for non-existent token and DISABLED for disabled member without stamping lastUsedAt', async () => {
  const invalid = await loginWithInvite(testDb, 'nonexistent-token', now)
  expect(invalid).toEqual({ ok: false, code: 'INVALID_TOKEN' })

  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const disabled = await createMember(testDb, { name: 'Disabled' })
  await setMemberStatus(testDb, admin.id, disabled.member.id, 'disabled')

  const disabledLogin = await loginWithInvite(testDb, disabled.inviteToken, now)
  expect(disabledLogin).toEqual({ ok: false, code: 'DISABLED' })

  // Verify lastUsedAt is not stamped on rejected login
  const tokenRows = await testDb.select().from(loginTokens).where(eq(loginTokens.memberId, disabled.member.id))
  expect(tokenRows[0].lastUsedAt).toBeNull()

  // Verify no audit logged for failed login
  const audits = await testDb.select().from(auditLog).where(eq(auditLog.action, 'auth.login'))
  expect(audits).toHaveLength(0)
})

it('loginWithInvite stamps lastUsedAt and audits auth.login on success', async () => {
  const { member, inviteToken } = await createMember(testDb, { name: 'Faith' })
  const login = await loginWithInvite(testDb, inviteToken, now)
  if (!login.ok) throw new Error(login.code)

  const tokenRows = await testDb.select().from(loginTokens).where(eq(loginTokens.memberId, member.id))
  expect(tokenRows[0].lastUsedAt).toEqual(now)

  const audits = await testDb.select().from(auditLog).where(eq(auditLog.action, 'auth.login'))
  expect(audits).toHaveLength(1)
  expect(audits[0].actorId).toBe(member.id)
  expect(audits[0].entityId).toBe(String(member.id))
  expect(JSON.stringify(audits[0])).not.toContain(inviteToken)
  expect(JSON.stringify(audits[0])).not.toContain(login.value.sessionToken)
})

it('serializes login against concurrent invite revocation, proving login blocks in innodb_trx until revocation commits', async () => {
  const target = await createMember(testDb, { name: 'ConcurrentRevoke' })

  let signalLocked!: () => void
  const lockedPromise = new Promise<void>((resolve) => {
    signalLocked = resolve
  })

  let signalProceedWithRevoke!: () => void
  const proceedPromise = new Promise<void>((resolve) => {
    signalProceedWithRevoke = resolve
  })

  let gateReleased = false
  const releaseGate = () => {
    if (!gateReleased) {
      gateReleased = true
      signalProceedWithRevoke()
    }
  }

  let txPromise: Promise<void> | null = null
  let loginPromise: ReturnType<typeof loginWithInvite> | null = null

  try {
    txPromise = testDb.transaction(async (txA) => {
      // Lock the login token row with FOR UPDATE
      await txA
        .select()
        .from(loginTokens)
        .where(eq(loginTokens.memberId, target.member.id))
        .for('update')

      // Signal that lock is acquired
      signalLocked()

      // Wait until test confirms login is observed in LOCK WAIT
      await proceedPromise

      // Revoke the token while holding the lock
      await txA
        .update(loginTokens)
        .set({ revokedAt: now })
        .where(eq(loginTokens.memberId, target.member.id))
    })

    // Wait until txA has locked the row
    await lockedPromise

    // Start loginWithInvite; it will attempt to lock loginTokens and block on txA's lock
    loginPromise = loginWithInvite(testDb, target.inviteToken, now)
    void loginPromise.catch(() => {})

    await waitForLockWait(hashToken(target.inviteToken))

    // Allow txA to perform update and commit
    releaseGate()

    const [_, loginResult] = await Promise.all([txPromise, loginPromise])

    expect(loginResult).toEqual({ ok: false, code: 'INVALID_TOKEN' })

    // Verify no session was created
    const sessionRows = await testDb.select().from(sessions).where(eq(sessions.memberId, target.member.id))
    expect(sessionRows).toHaveLength(0)

    // Verify lastUsedAt was not stamped
    const [tokenRow] = await testDb.select().from(loginTokens).where(eq(loginTokens.memberId, target.member.id))
    expect(tokenRow.lastUsedAt).toBeNull()
  } finally {
    releaseGate()
    if (txPromise) {
      await txPromise.catch(() => {})
    }
    if (loginPromise) {
      await loginPromise.catch(() => {})
    }
  }
})

it('serializes login against concurrent member status disabling, proving login blocks in innodb_trx until status change commits', async () => {
  const target = await createMember(testDb, { name: 'ConcurrentStatus' })

  let signalLocked!: () => void
  const lockedPromise = new Promise<void>((resolve) => {
    signalLocked = resolve
  })

  let signalProceed!: () => void
  const proceedPromise = new Promise<void>((resolve) => {
    signalProceed = resolve
  })

  let gateReleased = false
  const releaseGate = () => {
    if (!gateReleased) {
      gateReleased = true
      signalProceed()
    }
  }

  let txPromise: Promise<void> | null = null
  let loginPromise: ReturnType<typeof loginWithInvite> | null = null

  try {
    txPromise = testDb.transaction(async (txA) => {
      // Lock the member row with FOR UPDATE
      await txA
        .select()
        .from(members)
        .where(eq(members.id, target.member.id))
        .for('update')

      signalLocked()
      await proceedPromise

      await txA
        .update(members)
        .set({ status: 'disabled' })
        .where(eq(members.id, target.member.id))
    })

    await lockedPromise

    // loginWithInvite locks the member row first with .for('update'), so it blocks on txA's lock
    loginPromise = loginWithInvite(testDb, target.inviteToken, now)
    void loginPromise.catch(() => {})

    // Include the space after the id so e.g. 1 cannot match 10.
    await waitForLockWait(`\`members\`.\`id\` = ${target.member.id} `)

    releaseGate()

    const [_, loginResult] = await Promise.all([txPromise, loginPromise])

    expect(loginResult).toEqual({ ok: false, code: 'DISABLED' })

    const sessionRows = await testDb.select().from(sessions).where(eq(sessions.memberId, target.member.id))
    expect(sessionRows).toHaveLength(0)

    // Verify lastUsedAt was not stamped
    const [tokenRow] = await testDb.select().from(loginTokens).where(eq(loginTokens.memberId, target.member.id))
    expect(tokenRow.lastUsedAt).toBeNull()
  } finally {
    releaseGate()
    if (txPromise) {
      await txPromise.catch(() => {})
    }
    if (loginPromise) {
      await loginPromise.catch(() => {})
    }
  }
})

it('does not deadlock when admin logs in while rotating invite for another member (and reverse pairing)', async () => {
  // 1. Forward pairing: Admin A logs in while Admin A rotates Member B's invite
  for (let i = 0; i < 3; i++) {
    const adminA = await createMember(testDb, { name: `AdminA_${i}`, role: 'admin' })
    const memberB = await createMember(testDb, { name: `MemberB_${i}`, role: 'member' })

    const results = await Promise.allSettled([
      loginWithInvite(testDb, adminA.inviteToken, now),
      regenerateInvite(testDb, adminA.member.id, memberB.member.id, now),
    ])

    for (const r of results) {
      if (r.status === 'rejected') throw r.reason
      expect(r.value.ok).toBe(true)
    }
  }

  // 2. Reverse pairing: Admin B logs in while Admin B rotates Member A's invite
  for (let i = 0; i < 3; i++) {
    const memberA = await createMember(testDb, { name: `MemberA_rev_${i}`, role: 'member' })
    const adminB = await createMember(testDb, { name: `AdminB_rev_${i}`, role: 'admin' })

    const results = await Promise.allSettled([
      loginWithInvite(testDb, adminB.inviteToken, now),
      regenerateInvite(testDb, adminB.member.id, memberA.member.id, now),
    ])

    for (const r of results) {
      if (r.status === 'rejected') throw r.reason
      expect(r.value.ok).toBe(true)
    }
  }

  // 3. Cross pairing: Member B logs in while Admin A rotates Member B's invite
  for (let i = 0; i < 3; i++) {
    const adminA = await createMember(testDb, { name: `AdminA_cross_${i}`, role: 'admin' })
    const memberB = await createMember(testDb, { name: `MemberB_cross_${i}`, role: 'member' })

    const results = await Promise.allSettled([
      loginWithInvite(testDb, memberB.inviteToken, now),
      regenerateInvite(testDb, adminA.member.id, memberB.member.id, now),
    ])

    for (const r of results) {
      if (r.status === 'rejected') throw r.reason
    }
    const [loginRes, regenRes] = results as [PromiseFulfilledResult<any>, PromiseFulfilledResult<any>]
    expect(regenRes.value.ok).toBe(true)
    expect(['ok', 'INVALID_TOKEN'].includes(loginRes.value.ok ? 'ok' : loginRes.value.code)).toBe(true)
  }
})

it('getSessionMember rejects session if member is disabled later', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const user = await createMember(testDb, { name: 'User' })

  const login = await loginWithInvite(testDb, user.inviteToken, now)
  if (!login.ok) throw new Error(login.code)
  expect(await getSessionMember(testDb, login.value.sessionToken, now)).not.toBeNull()

  // Disable member
  await setMemberStatus(testDb, admin.id, user.member.id, 'disabled')
  expect(await getSessionMember(testDb, login.value.sessionToken, now)).toBeNull()
})

it('revokeSessions removes all sessions for a member', async () => {
  const user = await createMember(testDb, { name: 'User' })
  const login = await loginWithInvite(testDb, user.inviteToken, now)
  if (!login.ok) throw new Error(login.code)

  expect(await getSessionMember(testDb, login.value.sessionToken, now)).not.toBeNull()
  await revokeSessions(testDb, user.member.id)
  expect(await getSessionMember(testDb, login.value.sessionToken, now)).toBeNull()

  const sessionRows = await testDb.select().from(sessions).where(eq(sessions.memberId, user.member.id))
  expect(sessionRows).toHaveLength(0)
})

it('setMemberStatus enforces permissions and audits', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const user = (await createMember(testDb, { name: 'User' })).member

  // Non-admin cannot set status
  const forbidden = await setMemberStatus(testDb, user.id, admin.id, 'disabled')
  expect(forbidden).toEqual({ ok: false, code: 'FORBIDDEN' })

  // Non-existent target
  const notFound = await setMemberStatus(testDb, admin.id, 999999, 'disabled')
  expect(notFound).toEqual({ ok: false, code: 'NOT_FOUND' })

  // Admin updates user status
  const updated = await setMemberStatus(testDb, admin.id, user.id, 'disabled')
  if (!updated.ok) throw new Error(updated.code)
  expect(updated.value.status).toBe('disabled')

  const audits = await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.status'))
  expect(audits).toHaveLength(1)
  expect(audits[0].actorId).toBe(admin.id)
  expect(audits[0].entityId).toBe(String(user.id))
  expect(audits[0].detail).toEqual({ status: 'disabled' })
})
