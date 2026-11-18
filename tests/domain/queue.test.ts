import { and, eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { entries, members as memberRows } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { claimOffer, joinQueue, leaveQueue, expireOffers } from '@/domain/queue'
import { addGuest, removeGuest, signup, withdraw } from '@/domain/entries'

const now = new Date('2027-03-27T10:00:00Z')
const guestOpen = new Date('2027-03-29T11:00:00Z')
beforeEach(resetDb)

async function setup(memberCount: number) {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const members = await testDb.insert(memberRows)
    .values(Array.from({ length: 18 }, (_, i) => ({ name: `P${i}` }))).$returningId()
  for (const member of members.slice(0, memberCount)) {
    expect((await signup(testDb, { memberId: member.id, matchId: match.id, now })).ok).toBe(true)
  }
  return { match, members }
}

async function fullMatch() {
  const { match, members } = await setup(14)
  // Every join has the same timestamp, so promotions must break ties by entry ID.
  for (const member of members.slice(14, 17)) {
    expect(await joinQueue(testDb, { memberId: member.id, matchId: match.id, now })).toMatchObject({
      ok: true, value: { createdAt: now, status: 'queued' },
    })
  }
  return { match, members }
}

async function entryId(matchId: number, memberId: number) {
  const [entry] = await testDb.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.matchId, matchId), eq(entries.memberId, memberId)))
  if (!entry) throw new Error(`No entry for member ${memberId} in match ${matchId}`)
  return entry.id
}

function pendingOffers(matchId: number) {
  return testDb.select().from(entries)
    .where(and(eq(entries.matchId, matchId), eq(entries.status, 'offered')))
    .orderBy(entries.createdAt, entries.id)
}

async function pendingOffer(matchId: number) {
  const [offer] = await pendingOffers(matchId)
  return offer ?? null
}

it('offers a freed spot to the oldest queued member, exclusively', async () => {
  const { match, members } = await fullMatch()
  await withdraw(testDb, { entryId: await entryId(match.id, members[0].id), actorMemberId: members[0].id, now })
  const offer = await pendingOffer(match.id)
  expect(offer?.memberId).toBe(members[14].id)
  expect(offer?.status).toBe('offered')
  expect(offer?.offeredAt).toEqual(now)
  expect(offer?.offerExpiresAt).toEqual(new Date(now.getTime() + 30 * 60_000))
  // A public signup cannot steal the reserved spot.
  const steal = await signup(testDb, { memberId: members[17].id, matchId: match.id, now })
  expect(steal).toEqual({ ok: false, code: 'FULL' })
})

it('claims an offer and expires it into the next member', async () => {
  const { match, members } = await fullMatch()
  await withdraw(testDb, { entryId: await entryId(match.id, members[0].id), actorMemberId: members[0].id, now })
  const offer = await pendingOffer(match.id)
  const claimed = await claimOffer(testDb, { entryId: offer!.id, memberId: members[14].id, now: new Date(now.getTime() + 60_000) })
  expect(claimed.ok).toBe(true)
  expect(claimed).toMatchObject({ value: { status: 'confirmed', offeredAt: null, offerExpiresAt: null } })

  const second = await pendingOffer(match.id)
  expect(second).toBeNull()
  // Free another spot, then let the offer expire and move to the third queued member.
  await withdraw(testDb, { entryId: await entryId(match.id, members[1].id), actorMemberId: members[1].id, now })
  expect((await pendingOffer(match.id))?.memberId).toBe(members[15].id)
  const late = new Date(now.getTime() + 31 * 60_000)
  const expired = await expireOffers(testDb, match.id, late)
  expect(expired.expired).toBe(1)
  expect(expired.offered?.memberId).toBe(members[16].id)
  const [formerOffer] = await testDb.select().from(entries)
    .where(eq(entries.id, await entryId(match.id, members[15].id)))
  expect(formerOffer.status).toBe('withdrawn')
})

it('lets a member leave the queue', async () => {
  const { match, members } = await fullMatch()
  const res = await leaveQueue(testDb, { memberId: members[15].id, matchId: match.id, now })
  expect(res.ok).toBe(true)
  expect(res).toMatchObject({ value: { status: 'withdrawn' } })
})

it('makes two simultaneous offers after two withdrawals in a row', async () => {
  const { match, members } = await fullMatch()
  for (const member of members.slice(0, 2)) {
    expect((await withdraw(testDb, {
      entryId: await entryId(match.id, member.id), actorMemberId: member.id, now,
    })).ok).toBe(true)
  }
  expect((await pendingOffers(match.id)).map(offer => offer.memberId))
    .toEqual([members[14].id, members[15].id])
})

it('blocks guest signup during the guest phase when an offer reserves the spot', async () => {
  const { match, members } = await setup(13)
  const hostMemberId = members[0].id
  const guestInput = { hostMemberId, matchId: match.id, now: guestOpen }
  const guest = await addGuest(testDb, { ...guestInput, name: 'Dani' })
  if (!guest.ok) throw new Error(guest.code)
  expect((await joinQueue(testDb, { memberId: members[14].id, matchId: match.id, now: guestOpen })).ok).toBe(true)

  expect((await removeGuest(testDb, {
    entryId: guest.value.id, actorMemberId: hostMemberId, now: guestOpen,
  })).ok).toBe(true)
  expect((await pendingOffer(match.id))?.memberId).toBe(members[14].id)
  expect(await addGuest(testDb, { ...guestInput, name: 'Eli' })).toEqual({ ok: false, code: 'FULL' })
})
