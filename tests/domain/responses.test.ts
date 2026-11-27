import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { entries, matches } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import {
  ANSWERED_STATUSES, answeredMemberIds, canSeeUnanswered, listMatchResponses, responseOf,
} from '@/domain/responses'
import { resetDb, testDb } from '../db'

beforeEach(resetDb)

const open = new Date('2027-03-27T10:00:00Z') // Saturday, signups open
type Viewer = { role: 'admin' | 'member' }
const admin: Viewer = { role: 'admin' }
const member: Viewer = { role: 'member' }

it('maps every entry status to a response', () => {
  for (const status of entries.status.enumValues) {
    expect(['going', 'not_going', 'unanswered']).toContain(responseOf(status))
  }
  expect(responseOf(null)).toBe('unanswered')
  expect(responseOf('confirmed')).toBe('going')
  expect(responseOf('queued')).toBe('going')
  expect(responseOf('offered')).toBe('going')
  expect(responseOf('declined')).toBe('not_going')
  expect(responseOf('withdrawn')).toBe('unanswered')
  expect(responseOf('expired')).toBe('unanswered')
  expect(responseOf('removed')).toBe('unanswered')
  expect(new Set(ANSWERED_STATUSES)).toEqual(new Set(['confirmed', 'queued', 'offered', 'declined']))
})

it('lets every member see who has not answered', () => {
  expect(canSeeUnanswered(admin)).toBe(true)
  expect(canSeeUnanswered(member)).toBe(true)
})

async function scenario() {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const make = async (name: string, status?: 'pending' | 'disabled') =>
    (await createMember(testDb, { name, status })).member
  const people = {
    noRow: await make('beto'),
    withdrawn: await make('Ana'),
    expired: await make('dani'),
    removed: await make('Carla'),
    declined: await make('Zoe'),
    declined2: await make('eli'),
    confirmed: await make('Fede'),
    queued: await make('Gabi'),
    offered: await make('Hugo'),
    pending: await make('Pending', 'pending'),
    disabledDeclined: await make('Disabled', 'disabled'),
  }
  const rows = [
    ['withdrawn', people.withdrawn], ['expired', people.expired], ['removed', people.removed],
    ['declined', people.declined], ['declined', people.declined2], ['confirmed', people.confirmed],
    ['queued', people.queued], ['offered', people.offered], ['declined', people.disabledDeclined],
  ] as const
  for (const [status, who] of rows) {
    await testDb.insert(entries).values({ matchId: match.id, memberId: who.id, kind: 'member', status })
  }
  // A guest hosted by an unanswered member does not count as that member's answer.
  await testDb.insert(entries).values({
    matchId: match.id, kind: 'guest', guestName: 'Guest', hostMemberId: people.noRow.id, status: 'confirmed',
  })
  return { match, people }
}

it('lists not-going and unanswered active members, sorted by name', async () => {
  const { match } = await scenario()
  const result = await listMatchResponses(testDb, { matchId: match.id, viewer: admin, now: open })

  expect(result.notGoing.map(m => m.name)).toEqual(['eli', 'Zoe'])
  expect(result.unanswered?.map(m => m.name)).toEqual(['Ana', 'beto', 'Carla', 'dani'])
  expect(result.notGoing[0]).toEqual({
    id: expect.any(String), name: 'eli', nickname: null, image: null,
  })
})

it('shows the unanswered list to members, but only while answers are open', async () => {
  const { match } = await scenario()
  const at = (now: Date, viewer = admin) => listMatchResponses(testDb, { matchId: match.id, viewer, now })

  expect((await at(open, member)).unanswered?.map(m => m.name)).toEqual(['Ana', 'beto', 'Carla', 'dani'])
  expect((await at(open, member)).notGoing.map(m => m.name)).toEqual(['eli', 'Zoe'])
  expect((await at(new Date('2027-03-29T12:00:00Z'))).unanswered).not.toBeNull() // guest phase
  expect((await at(new Date('2027-03-26T05:59:00Z'))).unanswered).toBeNull() // before signups open
  expect((await at(new Date('2027-03-30T11:00:00Z'))).unanswered).toBeNull() // at lock time

  await testDb.update(matches).set({ status: 'locked' }).where(eq(matches.id, match.id))
  expect((await at(open)).unanswered).toBeNull()
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  expect((await at(open)).unanswered).toBeNull()
})

it('returns the members who answered either way', async () => {
  const { match, people } = await scenario()
  expect(await answeredMemberIds(testDb, match.id)).toEqual(new Set([
    people.declined.id, people.declined2.id, people.confirmed.id, people.queued.id, people.offered.id,
    people.disabledDeclined.id,
  ]))
})
