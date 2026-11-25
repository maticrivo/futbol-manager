import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { auditLog, matches } from '@/db/schema'
import { addGuest, signup } from '@/domain/entries'
import { lockMatch } from '@/domain/lock'
import { createMatchForDate, openSignupsNow, updateMatch, type UpdateMatchPatch } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { resetDb, testDb } from '../db'

beforeEach(resetDb)

it('freezes money fields after lock but allows venue', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  expect(await updateMatch(testDb, {
    actorId: admin.id, matchId: match.id, now: new Date('2027-03-30T12:00:00Z'), patch: { costAgorot: 4000 },
  })).toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  const venue = await updateMatch(testDb, {
    actorId: admin.id, matchId: match.id, now: new Date('2027-03-30T12:00:00Z'), patch: { venue: 'Campo 2' },
  })
  expect(venue.ok).toBe(true)
})

it('sets and clears the venue map link, rejecting invalid URLs', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  const base = { actorId: admin.id, matchId: match.id, now }

  const saved = await updateMatch(testDb, {
    ...base,
    patch: { venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6' },
  })
  expect(saved).toMatchObject({
    ok: true,
    value: { venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6' },
  })

  expect(await updateMatch(testDb, { ...base, patch: { venueUrl: 'not-a-url' } }))
    .toEqual({ ok: false, code: 'INVALID_PATCH' })

  const cleared = await updateMatch(testDb, { ...base, patch: { venueUrl: '' } })
  expect(cleared).toMatchObject({ ok: true, value: { venueUrl: null } })
})

it('refuses a capacity below the confirmed roster before lock', async () => {  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const a = (await createMember(testDb, { name: 'A' })).member
  const b = (await createMember(testDb, { name: 'B' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  await signup(testDb, { memberId: a.id, matchId: match.id, now })
  await signup(testDb, { memberId: b.id, matchId: match.id, now })
  expect(await updateMatch(testDb, {
    actorId: admin.id, matchId: match.id, now, patch: { capacity: 1 },
  })).toEqual({ ok: false, code: 'CAPACITY_BELOW_CONFIRMED' })
})

it('allows venue, kickoff and notes after lock while freezing every money field', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  const now = new Date('2027-03-30T12:00:00Z')
  const base = { actorId: admin.id, matchId: match.id, now }

  expect(await updateMatch(testDb, { ...base, patch: { costAgorot: 4000 } }))
    .toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  expect(await updateMatch(testDb, { ...base, patch: { capacity: 20 } }))
    .toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  expect(await updateMatch(testDb, { ...base, patch: { signupOpensAt: match.signupOpensAt } }))
    .toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  expect(await updateMatch(testDb, { ...base, patch: { guestPhaseAt: match.guestPhaseAt } }))
    .toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  expect(await updateMatch(testDb, { ...base, patch: { lockAt: match.lockAt } }))
    .toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })

  const updated = await updateMatch(testDb, {
    ...base, patch: { venue: 'Campo 2', kickoffAt: match.kickoffAt, notes: 'bring bibs' },
  })
  expect(updated).toMatchObject({ ok: true, value: { venue: 'Campo 2', notes: 'bring bibs' } })
})

it('refuses edits on played and cancelled matches', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')

  await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, match.id))
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch: { venue: 'X' } }))
    .toEqual({ ok: false, code: 'MATCH_FINISHED' })

  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch: { venue: 'X' } }))
    .toEqual({ ok: false, code: 'MATCH_FINISHED' })
})

it('rejects unknown patch keys', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  const patch = { bogus: 1 } as unknown as UpdateMatchPatch
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch }))
    .toEqual({ ok: false, code: 'INVALID_PATCH' })
})

it('rejects a kickoff on a different date', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  expect(await updateMatch(testDb, {
    actorId: admin.id, matchId: match.id, now, patch: { kickoffAt: new Date('2027-03-31T18:30:00Z') },
  })).toEqual({ ok: false, code: 'INVALID_PATCH' })
})

it('rejects an effective ordering violation', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  // lockAt must stay before kickoffAt.
  expect(await updateMatch(testDb, {
    actorId: admin.id, matchId: match.id, now, patch: { lockAt: new Date('2027-03-30T18:00:00Z') },
  })).toEqual({ ok: false, code: 'INVALID_PATCH' })
})

it('treats an empty patch as a no-op with no audit', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  const result = await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch: {} })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value).toEqual(match)
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'match.update'))).toEqual([])
})

it('raises capacity above the confirmed count and audits the changed keys', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const a = (await createMember(testDb, { name: 'A' })).member
  const b = (await createMember(testDb, { name: 'B' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  await signup(testDb, { memberId: a.id, matchId: match.id, now })
  await signup(testDb, { memberId: b.id, matchId: match.id, now })

  const result = await updateMatch(testDb, {
    actorId: admin.id, matchId: match.id, now, patch: { capacity: 20, venue: 'Park' },
  })
  expect(result).toMatchObject({ ok: true, value: { capacity: 20, venue: 'Park' } })

  const [audit] = await testDb.select().from(auditLog).where(eq(auditLog.action, 'match.update'))
  expect(audit).toMatchObject({
    actorId: admin.id, entity: 'match', entityId: String(match.id), detail: { keys: ['capacity', 'venue'] },
  })
})

it('counts guests toward the confirmed roster minimum', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const a = (await createMember(testDb, { name: 'A' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  await signup(testDb, { memberId: a.id, matchId: match.id, now })
  const guest = await addGuest(testDb, { hostMemberId: a.id, matchId: match.id, name: 'G', now: new Date('2027-03-29T12:00:00Z') })
  if (!guest.ok) throw new Error(guest.code)

  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch: { capacity: 2 } }))
    .toMatchObject({ ok: true })
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch: { capacity: 1 } }))
    .toEqual({ ok: false, code: 'CAPACITY_BELOW_CONFIRMED' })
})

it('requires an admin actor and an existing match', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const member = (await createMember(testDb, { name: 'Player' })).member
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')

  expect(await updateMatch(testDb, { actorId: member.id, matchId: match.id, now, patch: { venue: 'X' } }))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await updateMatch(testDb, { actorId: '00000000-0000-4000-8000-000000000000', matchId: match.id, now, patch: { venue: 'X' } }))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: 999999, now, patch: { venue: 'X' } }))
    .toEqual({ ok: false, code: 'NOT_FOUND' })
})

it('validates cost, capacity range and venue length', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  const base = { actorId: admin.id, matchId: match.id, now }

  expect(await updateMatch(testDb, { ...base, patch: { costAgorot: 0 } })).toEqual({ ok: false, code: 'INVALID_PATCH' })
  expect(await updateMatch(testDb, { ...base, patch: { costAgorot: 12.5 } })).toEqual({ ok: false, code: 'INVALID_PATCH' })
  expect(await updateMatch(testDb, { ...base, patch: { capacity: 0 } })).toEqual({ ok: false, code: 'INVALID_PATCH' })
  expect(await updateMatch(testDb, { ...base, patch: { capacity: 41 } })).toEqual({ ok: false, code: 'INVALID_PATCH' })
  expect(await updateMatch(testDb, { ...base, patch: { venue: 'x'.repeat(121) } })).toEqual({ ok: false, code: 'INVALID_PATCH' })
  expect(await updateMatch(testDb, { ...base, patch: { notes: 'x'.repeat(2001) } })).toEqual({ ok: false, code: 'INVALID_PATCH' })
})

it('openSignupsNow updates signupOpensAt and audits match.open_signups', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-26T15:00:00Z')

  const result = await openSignupsNow(testDb, { actorId: admin.id, matchId: match.id, now })
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(result.value.signupOpensAt.getTime()).toBe(now.getTime())
  expect(result.value.updatedAt.getTime()).toBe(now.getTime())

  const [dbMatch] = await testDb.select().from(matches).where(eq(matches.id, match.id))
  expect(dbMatch.signupOpensAt.getTime()).toBe(now.getTime())
  expect(dbMatch.updatedAt.getTime()).toBe(now.getTime())

  const [audit] = await testDb.select().from(auditLog).where(eq(auditLog.action, 'match.open_signups'))
  expect(audit).toMatchObject({
    actorId: admin.id,
    action: 'match.open_signups',
    entity: 'match',
    entityId: String(match.id),
    detail: { signupOpensAt: now.toISOString() },
  })
})

it('openSignupsNow rejects non-admin, non-existing and finished matches', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const member = (await createMember(testDb, { name: 'Player' })).member
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const now = new Date('2027-03-26T15:00:00Z')

  expect(await openSignupsNow(testDb, { actorId: member.id, matchId: match.id, now }))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await openSignupsNow(testDb, { actorId: '00000000-0000-4000-8000-000000000000', matchId: match.id, now }))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await openSignupsNow(testDb, { actorId: admin.id, matchId: 999999, now }))
    .toEqual({ ok: false, code: 'NOT_FOUND' })

  for (const status of ['played', 'cancelled', 'locked'] as const) {
    await testDb.update(matches).set({ status }).where(eq(matches.id, match.id))
    expect(await openSignupsNow(testDb, { actorId: admin.id, matchId: match.id, now }))
      .toEqual({ ok: false, code: 'MATCH_FINISHED' })
  }
})

