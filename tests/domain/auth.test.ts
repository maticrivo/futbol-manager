import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import {
  createMember,
  loginWithInvite,
  regenerateInvite,
  revokeSessions,
  setMemberStatus,
} from '@/domain/members'
import { getSessionMember } from '@/domain/sessions'
import { auditLog, loginTokens, sessions } from '@/db/schema'
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

  // New invite token works
  const newLogin = await loginWithInvite(testDb, regen.value.inviteToken, regenTime)
  expect(newLogin.ok).toBe(true)
})

it('loginWithInvite returns INVALID_TOKEN for non-existent token and DISABLED for disabled member', async () => {
  const invalid = await loginWithInvite(testDb, 'nonexistent-token', now)
  expect(invalid).toEqual({ ok: false, code: 'INVALID_TOKEN' })

  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const disabled = await createMember(testDb, { name: 'Disabled' })
  await setMemberStatus(testDb, admin.id, disabled.member.id, 'disabled')

  const disabledLogin = await loginWithInvite(testDb, disabled.inviteToken, now)
  expect(disabledLogin).toEqual({ ok: false, code: 'DISABLED' })

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
