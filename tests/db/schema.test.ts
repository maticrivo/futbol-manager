import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { charges, entries, matches, members } from '@/db/schema'

async function seedMatch() {
  const [member] = await testDb.insert(members).values({ name: 'Ana' }).$returningId()
  const [match] = await testDb.insert(matches).values({
    matchDate: '2027-03-30',
    kickoffAt: new Date('2027-03-30T17:30:00Z'),
    signupOpensAt: new Date('2027-03-25T22:00:00Z'),
    guestPhaseAt: new Date('2027-03-29T11:00:00Z'),
    lockAt: new Date('2027-03-30T11:00:00Z'),
    venue: 'Campo',
    costAgorot: 3500,
    capacity: 14,
  }).$returningId()
  return { memberId: member.id, matchId: match.id }
}

describe('schema constraints', () => {
  beforeEach(resetDb)

  it('rejects a second charge for the same member and match', async () => {
    const { memberId, matchId } = await seedMatch()
    const row = { matchId, memberId, amountAgorot: 3500, billingMonth: '2027-03' }
    await testDb.insert(charges).values(row)
    await expect(testDb.insert(charges).values(row)).rejects.toThrow()
  })

  it('rejects a second member entry but allows many guest entries without a member', async () => {
    const { memberId, matchId } = await seedMatch()
    await testDb.insert(entries).values({ matchId, memberId, kind: 'member', status: 'confirmed' })
    await expect(testDb.insert(entries).values({ matchId, memberId, kind: 'member', status: 'confirmed' })).rejects.toThrow()
    await testDb.insert(entries).values({ matchId, kind: 'guest', guestName: 'Dani', hostMemberId: memberId, status: 'confirmed' })
    await testDb.insert(entries).values({ matchId, kind: 'guest', guestName: 'Dani', hostMemberId: memberId, status: 'confirmed' })
    const guests = await testDb.select().from(entries).where(eq(entries.matchId, matchId))
    expect(guests).toHaveLength(3)
  })
})
