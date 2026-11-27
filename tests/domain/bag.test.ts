import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { bagDuties, matches, users } from '@/db/schema'
import { getBagCredits } from '@/domain/bag'
import { createMatchForDate } from '@/domain/matches'
import { resetDb, testDb } from '../db'

beforeEach(resetDb)

async function makeMembers(...names: string[]): Promise<string[]> {
  const rows = await testDb.insert(users)
    .values(names.map(name => ({ name, status: 'active' as const }))).returning({ id: users.id })
  return rows.map(row => row.id)
}

async function setDuty(
  matchDate: string, assigned: string, actual: string | null, cancelled = false,
): Promise<Date> {
  const match = await createMatchForDate(testDb, matchDate)
  if (cancelled) {
    await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  }
  await testDb.insert(bagDuties).values({
    matchId: match.id, assignedMemberId: assigned, actualMemberId: actual, assignedAt: match.kickoffAt,
  })
  return match.kickoffAt
}

const now = new Date('2027-03-29T12:00:00Z')

it('credits the actual taker over the assignee', async () => {
  const [ana, beto] = await makeMembers('Ana', 'Beto')
  const kickoff = await setDuty('2027-03-16', ana, beto)
  const credits = await getBagCredits(testDb, { now, memberIds: [ana, beto] })
  expect(credits.get(ana)).toBeNull()
  expect(credits.get(beto)?.toISOString()).toBe(kickoff.toISOString())
})

it('credits the assignee when the match was never recorded', async () => {
  const [ana] = await makeMembers('Ana')
  const kickoff = await setDuty('2027-03-23', ana, null)
  expect((await getBagCredits(testDb, { now, memberIds: [ana] })).get(ana)?.toISOString())
    .toBe(kickoff.toISOString())
})

it('ignores cancelled and future matches', async () => {
  const [ana] = await makeMembers('Ana')
  await setDuty('2027-03-09', ana, null, true)
  await setDuty('2027-04-06', ana, null)
  expect((await getBagCredits(testDb, { now, memberIds: [ana] })).get(ana)).toBeNull()
})
