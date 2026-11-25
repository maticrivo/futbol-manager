import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { insertMatch } from '../helpers/fixtures'
import {
  accounts,
  auditLog,
  charges,
  entries,
  expenses,
  matches,
  notificationPrefs,
  pushSubscriptions,
  sessions,
  settings,
  users,
} from '@/db/schema'

describe('schema constraints', () => {
  beforeEach(resetDb)

  it('keeps every timestamp column NOT NULL where the schema requires it', () => {
    expect(expenses.updatedAt.notNull).toBe(true)
    expect(settings.updatedAt.notNull).toBe(true)
    expect(users.createdAt.notNull).toBe(true)
    expect(users.updatedAt.notNull).toBe(true)
  })

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

  it('defaults social users to pending members with UUID ids', async () => {
    const [row] = await testDb.insert(users).values({ name: 'Ana', email: 'ana@example.com' }).returning()
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.role).toBe('member')
    expect(row.status).toBe('pending')
    expect(row.locale).toBe('en')
  })

  it('allows pending, active, and disabled user statuses', async () => {
    const [p] = await testDb.insert(users).values({ name: 'Pending User', status: 'pending' }).returning()
    const [a] = await testDb.insert(users).values({ name: 'Active User', status: 'active' }).returning()
    const [d] = await testDb.insert(users).values({ name: 'Disabled User', status: 'disabled' }).returning()

    const rows = await testDb.select().from(users)
    expect(rows.find((r) => r.id === p.id)?.status).toBe('pending')
    expect(rows.find((r) => r.id === a.id)?.status).toBe('active')
    expect(rows.find((r) => r.id === d.id)?.status).toBe('disabled')
  })

  it('supports extended profile fields with unique email and nullable optionals', async () => {
    const [full] = await testDb.insert(users).values({
      name: 'Full Profile',
      email: 'user@example.com',
      phone: '+1 555-0199',
      nickname: 'FP',
      image: 'https://example.com/avatar.jpg',
    }).returning()

    const [fullRow] = await testDb.select().from(users).where(eq(users.id, full.id))
    expect(fullRow.email).toBe('user@example.com')
    expect(fullRow.phone).toBe('+1 555-0199')
    expect(fullRow.nickname).toBe('FP')
    expect(fullRow.image).toBe('https://example.com/avatar.jpg')

    const [minimal] = await testDb.insert(users).values({ name: 'Minimal User' }).returning()
    const [minimalRow] = await testDb.select().from(users).where(eq(users.id, minimal.id))
    expect(minimalRow.email).toBeNull()
    expect(minimalRow.phone).toBeNull()
    expect(minimalRow.nickname).toBeNull()
    expect(minimalRow.image).toBeNull()

    await expect(
      testDb.insert(users).values({ name: 'Duplicate Email User', email: 'user@example.com' })
    ).rejects.toThrow()

    const [secondMinimal] = await testDb.insert(users).values({ name: 'Second Minimal User' }).returning()
    expect(secondMinimal.id).toBeDefined()
  })

  it('rejects a second charge for the same member and match', async () => {
    const [user] = await testDb.insert(users).values({ name: 'Ana', email: 'ana@example.com' }).returning()
    const match = await insertMatch(testDb)
    const row = { matchId: match.id, memberId: user.id, amountAgorot: 3500, billingMonth: '2027-03' }
    await testDb.insert(charges).values(row)
    await expect(testDb.insert(charges).values(row)).rejects.toThrow()
  })

  it('rejects a second member entry but allows many guest entries without a member', async () => {
    const [user] = await testDb.insert(users).values({ name: 'Ana', email: 'ana@example.com' }).returning()
    const match = await insertMatch(testDb)
    await testDb.insert(entries).values({ matchId: match.id, memberId: user.id, kind: 'member', status: 'confirmed' })
    await expect(
      testDb.insert(entries).values({ matchId: match.id, memberId: user.id, kind: 'member', status: 'confirmed' })
    ).rejects.toThrow()

    await testDb.insert(entries).values({ matchId: match.id, kind: 'guest', guestName: 'Dani', hostMemberId: user.id, status: 'confirmed' })
    await testDb.insert(entries).values({ matchId: match.id, kind: 'guest', guestName: 'Dani', hostMemberId: user.id, status: 'confirmed' })
    const guests = await testDb.select().from(entries).where(eq(entries.matchId, match.id))
    expect(guests).toHaveLength(3)
  })

  it('cascades auth and setup rows when deleting a user but blocks history', async () => {
    const [user] = await testDb.insert(users).values({ name: 'Bo', email: 'bo@example.com' }).returning()
    await testDb.insert(accounts).values({ userId: user.id, type: 'oauth', provider: 'google', providerAccountId: 'g-1' })
    await testDb.insert(sessions).values({ sessionToken: 'tok', userId: user.id, expires: new Date() })
    await testDb.insert(notificationPrefs).values({ memberId: user.id, category: 'bill_ready' })
    await testDb.insert(pushSubscriptions).values({ memberId: user.id, endpoint: 'https://push/1', p256dh: 'k', auth: 'a' })
    await testDb.insert(auditLog).values({ actorId: user.id, action: 'member.request_access', entity: 'member' })

    await testDb.delete(users).where(eq(users.id, user.id))

    expect(await testDb.select().from(accounts)).toHaveLength(0)
    expect(await testDb.select().from(sessions)).toHaveLength(0)
    expect(await testDb.select().from(notificationPrefs)).toHaveLength(0)
    expect(await testDb.select().from(pushSubscriptions)).toHaveLength(0)
    expect((await testDb.select().from(auditLog))[0].actorId).toBeNull()

    const [withHistory] = await testDb.insert(users).values({ name: 'Cy', email: 'cy@example.com' }).returning()
    const match = await insertMatch(testDb)
    await testDb.insert(entries).values({ matchId: match.id, memberId: withHistory.id, kind: 'member' })
    await expect(testDb.delete(users).where(eq(users.id, withHistory.id))).rejects.toThrow()
  })
})
