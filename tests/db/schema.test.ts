import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { charges, entries, matches, members } from '@/db/schema'

async function seedMatch() {
  const [member] = await testDb.insert(members).values({ name: 'Ana' }).returning()
  const [match] = await testDb.insert(matches).values({
    matchDate: '2027-03-30',
    kickoffAt: new Date('2027-03-30T17:30:00Z'),
    signupOpensAt: new Date('2027-03-25T22:00:00Z'),
    guestPhaseAt: new Date('2027-03-29T11:00:00Z'),
    lockAt: new Date('2027-03-30T11:00:00Z'),
    venue: 'Campo',
    costAgorot: 3500,
    capacity: 14,
  }).returning()
  return { memberId: member.id, matchId: match.id }
}

describe('schema constraints', () => {
  beforeEach(resetDb)

  it('round-trips instants across the process timezone', async () => {
    const instant = new Date('2027-03-30T11:00:00.000Z')
    const [row] = await testDb.insert(matches).values({
      matchDate: '2027-04-06',
      kickoffAt: instant,
      signupOpensAt: instant,
      guestPhaseAt: instant,
      lockAt: instant,
      venue: 'Campo',
      costAgorot: 3500,
      capacity: 14,
    }).returning({ kickoffAt: matches.kickoffAt })
    expect(row.kickoffAt.toISOString()).toBe(instant.toISOString())
  })

  it('includes venueUrl column in matches table definition', () => {
    expect(matches.venueUrl).toBeDefined()
  })

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

  it('allows members with status pending, active, and disabled', async () => {
    const [p] = await testDb.insert(members).values({ name: 'Pending User', status: 'pending' }).returning()
    const [a] = await testDb.insert(members).values({ name: 'Active User', status: 'active' }).returning()
    const [d] = await testDb.insert(members).values({ name: 'Disabled User', status: 'disabled' }).returning()

    const rows = await testDb.select().from(members)
    const pendingMember = rows.find((r) => r.id === p.id)
    const activeMember = rows.find((r) => r.id === a.id)
    const disabledMember = rows.find((r) => r.id === d.id)

    expect(pendingMember?.status).toBe('pending')
    expect(activeMember?.status).toBe('active')
    expect(disabledMember?.status).toBe('disabled')
  })

  it('supports extended member profile fields with unique email and nullable optionals', async () => {
    const [full] = await testDb.insert(members).values({
      name: 'Full Profile',
      email: 'user@example.com',
      phone: '+1 555-0199',
      nickname: 'FP',
      image: 'https://example.com/avatar.jpg',
    }).returning()

    const [fullRow] = await testDb.select().from(members).where(eq(members.id, full.id))
    expect(fullRow.email).toBe('user@example.com')
    expect(fullRow.phone).toBe('+1 555-0199')
    expect(fullRow.nickname).toBe('FP')
    expect(fullRow.image).toBe('https://example.com/avatar.jpg')

    const [minimal] = await testDb.insert(members).values({
      name: 'Minimal User',
    }).returning()

    const [minimalRow] = await testDb.select().from(members).where(eq(members.id, minimal.id))
    expect(minimalRow.email).toBeNull()
    expect(minimalRow.phone).toBeNull()
    expect(minimalRow.nickname).toBeNull()
    expect(minimalRow.image).toBeNull()

    await expect(
      testDb.insert(members).values({
        name: 'Duplicate Email User',
        email: 'user@example.com',
      })
    ).rejects.toThrow()

    // Multiple members with null email are permitted
    const [secondMinimal] = await testDb.insert(members).values({
      name: 'Second Minimal User',
    }).returning()
    expect(secondMinimal.id).toBeDefined()
  })
})
