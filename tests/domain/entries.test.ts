import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeEach, expect, it } from 'vitest'
import type { Db } from '@/db'
import * as schema from '@/db/schema'
import { entries, matches, users } from '@/db/schema'
import {
  addGuest, clearDecline, confirmedCount, decline, freeSpots, pendingOfferCount, removeGuest, signup, withdraw,
} from '@/domain/entries'
import { createMatchForDate } from '@/domain/matches'
import { getMatchView } from '@/domain/matchView'
import { testDb, resetDb } from '../db'

const now = new Date('2027-03-27T10:00:00Z') // Saturday, signup open
const guestOpen = new Date('2027-03-29T11:00:00Z')
beforeEach(resetDb)

async function makeMembers(db: Db, n: number) {
  return db.insert(users).values(Array.from({ length: n }, (_, i) => ({ name: `P${i}` }))).returning()
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

it('reads standalone free spots in one statement per call', async () => {
  const { match, made } = await setup(1)
  await testDb.update(matches).set({ capacity: 3 }).where(eq(matches.id, match.id))
  await testDb.insert(entries).values({ matchId: match.id, memberId: made[1].id, kind: 'member', status: 'offered' })

  // Observe the statement count against real MySQL without a timing-dependent race.
  let statements = 0
  const observedDb = drizzle(testDb.$client, {
    schema, logger: { logQuery: () => { statements++ } },
  })
  expect(await freeSpots(observedDb, match.id)).toBe(1)
  expect(statements).toBe(1)

  await testDb.insert(entries).values({ matchId: match.id, memberId: made[2].id, kind: 'member', status: 'confirmed' })
  expect(await freeSpots(observedDb, match.id)).toBe(0)
  expect(statements).toBe(2)
  expect(await freeSpots(testDb, match.id + 1)).toBe(0)
})

it('returns counts as numbers', async () => {
  const { match } = await setup(2)
  expect(typeof await confirmedCount(testDb, match.id)).toBe('number')
  expect(await confirmedCount(testDb, match.id)).toBe(2)
  expect(typeof await freeSpots(testDb, match.id)).toBe('number')
})

async function memberRows(matchId: number, memberId: string) {
  return testDb.select().from(entries).where(and(eq(entries.matchId, matchId), eq(entries.memberId, memberId)))
}

it.each([null, 'withdrawn', 'expired', 'removed'] as const)('declines from %s and treats a repeat as a no-op', async start => {
  const { match, made } = await setup()
  const memberId = made[0].id
  if (start) await testDb.insert(entries).values({ matchId: match.id, memberId, kind: 'member', status: start })

  const input = { memberId, matchId: match.id, now }
  expect(await decline(testDb, input)).toMatchObject({ ok: true, value: { memberId, status: 'declined' } })
  expect(await decline(testDb, input)).toMatchObject({ ok: true, value: { memberId, status: 'declined' } })
  expect(await memberRows(match.id, memberId)).toMatchObject([{ status: 'declined' }])
})

it('frees the spot when a confirmed member declines', async () => {
  const { match, made } = await setup(14)
  expect(await freeSpots(testDb, match.id)).toBe(0)
  expect(await decline(testDb, { memberId: made[0].id, matchId: match.id, now })).toMatchObject({
    ok: true, value: { status: 'declined', offeredAt: null, offerExpiresAt: null },
  })
  expect(await freeSpots(testDb, match.id)).toBe(1)
})

it('accepts answers only while signups are open and leaves the row alone otherwise', async () => {
  const { match, made } = await setup()
  const [going, notGoing] = made
  await testDb.insert(entries).values([
    { matchId: match.id, memberId: going.id, kind: 'member', status: 'confirmed' },
    { matchId: match.id, memberId: notGoing.id, kind: 'member', status: 'declined' },
  ])
  const attempt = async (when: Date) => ({
    decline: await decline(testDb, { memberId: going.id, matchId: match.id, now: when }),
    clear: await clearDecline(testDb, { memberId: notGoing.id, matchId: match.id, now: when }),
  })

  const beforeOpen = new Date('2027-03-26T05:59:00Z')
  expect(await attempt(beforeOpen)).toEqual({
    decline: { ok: false, code: 'NOT_OPEN' }, clear: { ok: false, code: 'NOT_OPEN' },
  })
  const atLock = new Date('2027-03-30T11:00:00Z')
  expect(await attempt(atLock)).toEqual({
    decline: { ok: false, code: 'MATCH_LOCKED' }, clear: { ok: false, code: 'MATCH_LOCKED' },
  })
  await testDb.update(matches).set({ status: 'locked' }).where(eq(matches.id, match.id))
  expect(await attempt(now)).toEqual({
    decline: { ok: false, code: 'MATCH_LOCKED' }, clear: { ok: false, code: 'MATCH_LOCKED' },
  })
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  expect(await attempt(now)).toEqual({
    decline: { ok: false, code: 'MATCH_CANCELLED' }, clear: { ok: false, code: 'MATCH_CANCELLED' },
  })

  expect(await memberRows(match.id, going.id)).toMatchObject([{ status: 'confirmed' }])
  expect(await memberRows(match.id, notGoing.id)).toMatchObject([{ status: 'declined' }])
})

it('clears only a decline, and treats an already undecided member as a no-op', async () => {
  const { match, made } = await setup()
  const statuses = ['declined', 'withdrawn', 'confirmed', 'queued', 'offered'] as const
  for (const [i, status] of statuses.entries()) {
    await testDb.insert(entries).values({ matchId: match.id, memberId: made[i].id, kind: 'member', status })
  }
  const clear = (i: number) => clearDecline(testDb, { memberId: made[i].id, matchId: match.id, now })

  expect(await clear(0)).toMatchObject({ ok: true, value: { status: 'withdrawn' } })
  expect(await clear(1)).toMatchObject({ ok: true, value: { status: 'withdrawn' } })
  for (const i of [2, 3, 4]) expect(await clear(i)).toEqual({ ok: false, code: 'NOT_DECLINED' })
  expect(await clear(5)).toEqual({ ok: true, value: null }) // no row at all
  expect(await memberRows(match.id, made[5].id)).toEqual([])
})

it('lists a member who signs up again, after declining or withdrawing, at the end of the roster', async () => {
  const { match, made } = await setup()
  const [a, b, c] = made
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000)
  const roster = async () => (await getMatchView(testDb, { matchId: match.id, memberId: a.id, now: at(10) }))
    .roster.map(entry => entry.memberId)

  for (const [i, member] of [a, b, c].entries()) {
    expect((await signup(testDb, { memberId: member.id, matchId: match.id, now: at(i) })).ok).toBe(true)
  }
  const [aEntry] = await memberRows(match.id, a.id)
  expect((await withdraw(testDb, { entryId: aEntry.id, actorMemberId: a.id, now: at(3) })).ok).toBe(true)
  expect((await signup(testDb, { memberId: a.id, matchId: match.id, now: at(4) })).ok).toBe(true)
  expect(await roster()).toEqual([b.id, c.id, a.id])

  expect((await decline(testDb, { memberId: b.id, matchId: match.id, now: at(5) })).ok).toBe(true)
  expect((await signup(testDb, { memberId: b.id, matchId: match.id, now: at(6) })).ok).toBe(true)
  expect(await roster()).toEqual([c.id, a.id, b.id])
})
