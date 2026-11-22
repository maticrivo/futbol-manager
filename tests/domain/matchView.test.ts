import { beforeEach, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { matches } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { addGuest, signup, withdraw } from '@/domain/entries'
import { joinQueue } from '@/domain/queue'
import { getMatchView } from '@/domain/matchView'

beforeEach(resetDb)

it('derives the phase from the clock', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const { member } = await createMember(testDb, { name: 'Ana' })
  const at = (iso: string) => getMatchView(testDb, { matchId: match.id, memberId: member.id, now: new Date(iso) })
  expect((await at('2027-03-25T21:00:00Z')).phase).toBe('before')
  expect((await at('2027-03-25T22:00:00Z')).phase).toBe('open')
  expect((await at('2027-03-29T11:00:00Z')).phase).toBe('guest')
  expect((await at('2027-03-30T11:00:00Z')).phase).toBe('locked')
})

it('reports my entry and my FIFO queue position', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const people = []
  for (let i = 0; i < 16; i++) people.push((await createMember(testDb, { name: `P${i}` })).member)
  const now = new Date('2027-03-27T10:00:00Z')
  for (const p of people.slice(0, 14)) await signup(testDb, { memberId: p.id, matchId: match.id, now })
  await joinQueue(testDb, { memberId: people[14].id, matchId: match.id, now })
  await joinQueue(testDb, { memberId: people[15].id, matchId: match.id, now })
  const view = await getMatchView(testDb, { matchId: match.id, memberId: people[15].id, now })
  expect(view.spotsLeft).toBe(0)
  expect(view.queuePosition).toBe(2)
  expect(view.myEntry).toBeNull()
  expect(view.myQueueEntry?.status).toBe('queued')
  expect(view.queue.map(entry => entry.memberId)).toEqual([people[14].id, people[15].id])
  const confirmed = await getMatchView(testDb, { matchId: match.id, memberId: people[0].id, now })
  expect(confirmed.myEntry?.memberId).toBe(people[0].id)
  expect(confirmed.queuePosition).toBeNull()
})

it('lists the guest and host names without treating the guest as the host’s own entry', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const { member } = await createMember(testDb, { name: 'Ana' })
  const now = match.guestPhaseAt
  const result = await addGuest(testDb, { hostMemberId: member.id, matchId: match.id, name: 'Noa', now })
  expect(result.ok).toBe(true)

  const view = await getMatchView(testDb, { matchId: match.id, memberId: member.id, now })
  expect(view.myEntry).toBeNull()
  expect(view.roster).toMatchObject([{ kind: 'guest', guestName: 'Noa', hostName: 'Ana' }])
})

it('includes each member nickname and image for the roster avatar', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const { member } = await createMember(testDb, {
    name: 'Noam Levi',
    nickname: 'Noamy',
    image: 'data:image/png;base64,abc',
  })
  const now = new Date('2027-03-27T10:00:00Z')
  await signup(testDb, { memberId: member.id, matchId: match.id, now })

  const view = await getMatchView(testDb, { matchId: match.id, memberId: member.id, now })
  expect(view.roster).toMatchObject([
    { memberName: 'Noam Levi', memberNickname: 'Noamy', memberImage: 'data:image/png;base64,abc' },
  ])
})

it.each(['cancelled', 'played', 'locked'] as const)('honors persisted %s status over the clock', async status => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const { member } = await createMember(testDb, { name: 'Ana' })
  await testDb.update(matches).set({ status }).where(eq(matches.id, match.id))

  expect((await getMatchView(testDb, { matchId: match.id, memberId: member.id, now: match.signupOpensAt })).phase)
    .toBe(status)
})

it('reports the caller’s offer and counts it against the last available spot', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const now = new Date('2027-03-27T10:00:00Z')
  const confirmations = []
  for (let i = 0; i < 14; i++) {
    const { member } = await createMember(testDb, { name: `P${i}` })
    const result = await signup(testDb, { memberId: member.id, matchId: match.id, now })
    if (!result.ok) throw new Error(`Fixture signup failed: ${result.code}`)
    confirmations.push(result.value)
  }
  const { member } = await createMember(testDb, { name: 'Ana' })
  expect((await joinQueue(testDb, { matchId: match.id, memberId: member.id, now })).ok).toBe(true)
  const first = confirmations[0]
  expect((await withdraw(testDb, { entryId: first.id, actorMemberId: first.memberId!, now })).ok).toBe(true)

  const view = await getMatchView(testDb, { matchId: match.id, memberId: member.id, now })
  expect(view.myOffer).toMatchObject({ status: 'offered', memberId: member.id })
  expect(view.myQueueEntry).toBeNull()
  expect(view.queuePosition).toBeNull()
  expect(view.roster).toHaveLength(13)
  expect(view.spotsLeft).toBe(0)
})

it('rejects a nonexistent match', async () => {
  await expect(getMatchView(testDb, { matchId: 1, memberId: 1, now: new Date('2027-03-30') }))
    .rejects.toThrow('Match 1 not found')
})

it('still reports the caller as queued when there is an unreserved spot', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const now = match.signupOpensAt
  const { member: player } = await createMember(testDb, { name: 'Ana' })
  const { member: waiting } = await createMember(testDb, { name: 'Noa' })
  await testDb.update(matches).set({ capacity: 1 }).where(eq(matches.id, match.id))
  expect((await signup(testDb, { matchId: match.id, memberId: player.id, now })).ok).toBe(true)
  expect((await joinQueue(testDb, { matchId: match.id, memberId: waiting.id, now })).ok).toBe(true)
  await testDb.update(matches).set({ capacity: 2 }).where(eq(matches.id, match.id))

  const view = await getMatchView(testDb, { matchId: match.id, memberId: waiting.id, now })
  expect(view.phase).toBe('open')
  expect(view.spotsLeft).toBe(1)
  expect(view.myQueueEntry).toMatchObject({ memberId: waiting.id, status: 'queued' })
  expect(view.myOffer).toBeNull()
})
