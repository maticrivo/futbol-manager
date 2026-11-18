import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import type { Db } from '@/db'
import { entries, matches, members } from '@/db/schema'
import { addGuest, confirmedCount, freeSpots, pendingOfferCount, removeGuest, signup, withdraw } from '@/domain/entries'
import { createMatchForDate } from '@/domain/matches'
import { testDb, resetDb } from '../db'

const now = new Date('2027-03-27T10:00:00Z') // Saturday, signup open
const guestOpen = new Date('2027-03-29T11:00:00Z')
beforeEach(resetDb)

async function makeMembers(db: Db, n: number) {
  return db.insert(members).values(Array.from({ length: n }, (_, i) => ({ name: `P${i}` }))).$returningId()
}

async function setup(count = 0) {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const made = await makeMembers(testDb, 19)
  for (const m of made.slice(0, count)) {
    await testDb.insert(entries).values({ matchId: match.id, memberId: m.id, kind: 'member', status: 'confirmed' })
  }
  return { match, made }
}

it('signs up while open and rejects duplicates', async () => {
  const { match, made } = await setup()
  const input = { memberId: made[0].id, matchId: match.id, now }
  expect(await signup(testDb, input)).toMatchObject({
    ok: true, value: { memberId: made[0].id, kind: 'member', status: 'confirmed' },
  })
  expect(await signup(testDb, input)).toEqual({ ok: false, code: 'ALREADY_SIGNED_UP' })
})

it('rejects signup before the window and after lock', async () => {
  const { match, made } = await setup()
  const before = new Date('2027-03-25T21:59:00Z')
  expect(await signup(testDb, { memberId: made[0].id, matchId: match.id, now: before })).toEqual({ ok: false, code: 'NOT_OPEN' })
  const after = new Date('2027-03-30T11:00:00Z')
  expect(await signup(testDb, { memberId: made[1].id, matchId: match.id, now: after })).toEqual({ ok: false, code: 'MATCH_LOCKED' })
})

it('never confirms more than the capacity under a stampede', async () => {
  const { match, made } = await setup(13)
  const results = await Promise.all(made.slice(13).map(m => signup(testDb, { memberId: m.id, matchId: match.id, now })))
  expect(results.filter(r => r.ok)).toHaveLength(1)
  expect(results.filter(r => !r.ok)).toEqual(Array.from({ length: 5 }, () => ({ ok: false, code: 'FULL' })))
  expect(await confirmedCount(testDb, match.id)).toBe(14)
})

it('frees a spot on withdrawal, lets the same member sign up again, and blocks withdrawal after lock', async () => {
  const { match, made } = await setup(13)
  const memberId = made[14].id
  const joined = await signup(testDb, { memberId, matchId: match.id, now })
  if (!joined.ok) throw new Error(joined.code)
  const entryId = joined.value.id
  expect(await withdraw(testDb, { entryId, actorMemberId: memberId, now })).toMatchObject({
    ok: true, value: { id: entryId, status: 'withdrawn' },
  })
  expect(await confirmedCount(testDb, match.id)).toBe(13)

  const again = await signup(testDb, { memberId, matchId: match.id, now })
  expect(again).toMatchObject({ ok: true, value: { id: entryId, status: 'confirmed' } })
  const after = new Date('2027-03-30T11:01:00Z')
  expect(await withdraw(testDb, { entryId, actorMemberId: memberId, now: after })).toEqual({ ok: false, code: 'LOCKED' })
})

it('opens guests only from Monday 14:00 and counts them against capacity', async () => {
  const { match, made } = await setup(12)
  const input = { hostMemberId: made[0].id, matchId: match.id, name: 'Dani' }
  const early = new Date('2027-03-29T10:59:00Z')
  expect(await addGuest(testDb, { ...input, now: early })).toEqual({ ok: false, code: 'GUEST_PHASE_CLOSED' })
  expect(await addGuest(testDb, { ...input, name: ' Dani ', now: guestOpen })).toMatchObject({
    ok: true, value: { kind: 'guest', status: 'confirmed', guestName: 'Dani', memberId: null, hostMemberId: made[0].id },
  })
  expect((await addGuest(testDb, { ...input, name: 'Eli', now: guestOpen })).ok).toBe(true)
  expect(await addGuest(testDb, { ...input, name: 'TooLate', now: guestOpen })).toEqual({ ok: false, code: 'FULL' })
  expect(await confirmedCount(testDb, match.id)).toBe(14)
})

it('lets a host remove their own guest but rejects a different member', async () => {
  const { match, made } = await setup()
  const guest = await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: 'Dani', now: guestOpen })
  if (!guest.ok) throw new Error(guest.code)
  const input = { entryId: guest.value.id, now: guestOpen }
  expect(await removeGuest(testDb, { ...input, actorMemberId: made[1].id })).toEqual({ ok: false, code: 'NOT_OWNER' })
  expect(await removeGuest(testDb, { ...input, actorMemberId: made[0].id })).toMatchObject({
    ok: true, value: { id: guest.value.id, status: 'removed' },
  })
  expect(await removeGuest(testDb, { ...input, actorMemberId: made[0].id })).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await confirmedCount(testDb, match.id)).toBe(0)
})

it('rejects a whitespace-only guest name', async () => {
  const { match, made } = await setup()
  expect(await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: ' \t ', now: guestOpen }))
    .toEqual({ ok: false, code: 'INVALID_NAME' })
})

it('reserves spots for offered entries against the match capacity snapshot', async () => {
  const { match, made } = await setup(1)
  await testDb.update(matches).set({ capacity: 2 }).where(eq(matches.id, match.id))
  await testDb.insert(entries).values({
    matchId: match.id, memberId: made[1].id, kind: 'member', status: 'offered', offerExpiresAt: now,
  })
  expect(await confirmedCount(testDb, match.id)).toBe(1)
  expect(await pendingOfferCount(testDb, match.id)).toBe(1)
  expect(await freeSpots(testDb, match.id)).toBe(0)
  expect(await signup(testDb, { memberId: made[2].id, matchId: match.id, now })).toEqual({ ok: false, code: 'FULL' })
  expect(await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: 'Dani', now: guestOpen }))
    .toEqual({ ok: false, code: 'FULL' })
})
