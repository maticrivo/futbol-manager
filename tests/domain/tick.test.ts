import { eq } from 'drizzle-orm'
import { beforeEach, expect, it, vi } from 'vitest'
import { bagDuties, charges, entries, matches, users, notificationPrefs } from '@/db/schema'
import { signup } from '@/domain/entries'
import { advanceMatch, lockMatch } from '@/domain/lock'
import { createMatchForDate, getMatch } from '@/domain/matches'
import { NOTIFICATION_CATEGORIES } from '@/domain/notifications'
import { runTick } from '@/domain/tick'
import { savePushSubscription } from '@/lib/push'
import { resetDb, testDb } from '../db'

const lockTime = new Date('2027-03-30T11:00:00Z')
const signupNow = new Date('2027-03-27T10:00:00Z')
const transport = vi.fn().mockResolvedValue({ statusCode: 201 })

beforeEach(() => {
  transport.mockClear()
  return resetDb()
})

async function confirmMembers(matchId: number, n: number): Promise<void> {
  const created = await testDb
    .insert(users)
    .values(Array.from({ length: n }, (_, i) => ({ name: `Player ${i}`, status: 'active' as const })))
    .returning()
  for (const { id } of created) {
    const result = await signup(testDb, { memberId: id, matchId, now: signupNow })
    if (!result.ok) throw new Error(result.code)
  }
}

async function subscribeThreeMembers(): Promise<void> {
  const created = await testDb
    .insert(users)
    .values([{ name: 'Ana', status: 'active' as const }, { name: 'Ben', status: 'active' as const }, { name: 'Dana', status: 'active' as const }])
    .returning()
  for (const { id } of created) {
    await savePushSubscription(testDb, { memberId: id, endpoint: `https://push/${id}`, p256dh: 'k', auth: 'a' })
    for (const category of NOTIFICATION_CATEGORIES) {
      await testDb.insert(notificationPrefs).values({ memberId: id, category, enabled: true })
    }
  }
}

async function subscribeAndConfirm(matchId: number, n: number): Promise<string[]> {
  const created = await testDb.insert(users)
    .values(Array.from({ length: n }, (_, i) => ({ name: `Bag ${i}`, status: 'active' as const })))
    .returning({ id: users.id })
  for (const { id } of created) {
    await savePushSubscription(testDb, { memberId: id, endpoint: `https://push/${id}`, p256dh: 'k', auth: 'a' })
    const signed = await signup(testDb, { memberId: id, matchId, now: signupNow })
    if (!signed.ok) throw new Error(signed.code)
  }
  return created.map(row => row.id)
}

it('locks once, creates the next match once and never double-charges', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await confirmMembers(match.id, 3)

  const first = await runTick(testDb, lockTime, transport)
  const second = await runTick(testDb, lockTime, transport)

  expect(first.locked).toBe(1)
  expect(second.locked).toBe(0)
  expect(first.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  expect(await testDb.select().from(charges).where(eq(charges.matchId, match.id))).toHaveLength(3)
  const scheduled = await testDb
    .select()
    .from(matches)
    .where(eq(matches.status, 'scheduled'))
    .orderBy(matches.matchDate)
  expect(scheduled.map((m) => m.matchDate)).toEqual(['2027-04-06'])
})

it('sends the Friday signup push once per member', async () => {
  await createMatchForDate(testDb, '2027-03-30')
  await subscribeThreeMembers()
  const fridayNine = new Date('2027-03-26T06:00:00Z')

  const a = await runTick(testDb, fridayNine, transport)
  const b = await runTick(testDb, fridayNine, transport)

  expect(a.notificationsSent).toBe(3)
  expect(b.notificationsSent).toBe(0)
})

it('repairs a page-triggered lock by creating the successor', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await confirmMembers(match.id, 3)
  await lockMatch(testDb, match.id, lockTime)

  const first = await runTick(testDb, lockTime, transport)
  const second = await runTick(testDb, lockTime, transport)

  expect(first.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  expect(first.locked).toBe(0)
  const dates = await testDb
    .select({ matchDate: matches.matchDate })
    .from(matches)
    .orderBy(matches.matchDate)
  expect(dates.map((d) => d.matchDate)).toEqual(['2027-03-30', '2027-04-06'])
})

it('self-heals by creating the strictly next Tuesday when no match exists', async () => {
  const now = new Date('2027-03-25T12:00:00Z')

  const first = await runTick(testDb, now, transport)
  const second = await runTick(testDb, now, transport)

  expect(first.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  const rows = await testDb.select({ matchDate: matches.matchDate }).from(matches)
  expect(rows).toEqual([{ matchDate: '2027-03-30' }])
})

it('self-heals an empty schedule exactly once under concurrent ticks', async () => {
  const now = new Date('2027-03-25T12:00:00Z')

  const [a, b] = await Promise.all([
    runTick(testDb, now, transport),
    runTick(testDb, now, transport),
  ])

  expect(a.matchesCreated + b.matchesCreated).toBe(1)
  const rows = await testDb.select({ matchDate: matches.matchDate }).from(matches)
  expect(rows).toEqual([{ matchDate: '2027-03-30' }])
})

it('does not recreate a cancelled week but cascades to the following week', async () => {
  const cancelled = await createMatchForDate(testDb, '2027-03-30')
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, cancelled.id))

  const result = await runTick(testDb, new Date('2027-03-25T12:00:00Z'), transport)

  expect(result.matchesCreated).toBe(1)
  const rows = await testDb
    .select({ matchDate: matches.matchDate, status: matches.status })
    .from(matches)
    .orderBy(matches.matchDate)
  expect(rows).toEqual([
    { matchDate: '2027-03-30', status: 'cancelled' },
    { matchDate: '2027-04-06', status: 'scheduled' },
  ])
})

it('skips a run of cancelled weeks and schedules the first free Tuesday', async () => {
  for (const date of ['2027-03-30', '2027-04-06']) {
    const match = await createMatchForDate(testDb, date)
    await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  }

  const now = new Date('2027-03-28T12:00:00Z')
  const first = await runTick(testDb, now, transport)
  const second = await runTick(testDb, now, transport)

  expect(first.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  const rows = await testDb
    .select({ matchDate: matches.matchDate, status: matches.status })
    .from(matches)
    .orderBy(matches.matchDate)
  expect(rows).toEqual([
    { matchDate: '2027-03-30', status: 'cancelled' },
    { matchDate: '2027-04-06', status: 'cancelled' },
    { matchDate: '2027-04-13', status: 'scheduled' },
  ])
})

it('jumps to the next Tuesday when the latest match is far in the past', async () => {
  const old = await createMatchForDate(testDb, '2027-01-05')
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, old.id))

  const now = new Date('2027-03-28T12:00:00Z')
  const result = await runTick(testDb, now, transport)

  expect(result.matchesCreated).toBe(1)
  const rows = await testDb
    .select({ matchDate: matches.matchDate, status: matches.status })
    .from(matches)
    .orderBy(matches.matchDate)
  expect(rows).toEqual([
    { matchDate: '2027-01-05', status: 'cancelled' },
    { matchDate: '2027-03-30', status: 'scheduled' },
  ])
})

it('locks exactly once and creates exactly one successor under concurrent ticks', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await confirmMembers(match.id, 3)

  const [a, b] = await Promise.all([
    runTick(testDb, lockTime, transport),
    runTick(testDb, lockTime, transport),
  ])

  expect(a.locked + b.locked).toBe(1)
  expect(a.matchesCreated + b.matchesCreated).toBe(1)
  expect(await testDb.select().from(charges).where(eq(charges.matchId, match.id))).toHaveLength(3)
  const dates = await testDb
    .select({ matchDate: matches.matchDate })
    .from(matches)
    .orderBy(matches.matchDate)
  expect(dates.map((d) => d.matchDate)).toEqual(['2027-03-30', '2027-04-06'])
})

it('locks a zero-roster match and still counts the lock, then creates its successor', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')

  const first = await runTick(testDb, lockTime, transport)
  const second = await runTick(testDb, lockTime, transport)

  expect(first.locked).toBe(1)
  expect(second.locked).toBe(0)
  expect(first.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  expect(await testDb.select().from(charges).where(eq(charges.matchId, match.id))).toHaveLength(0)
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'locked' })
})

it('repairs a played-only table by scheduling the week after the latest match', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await lockMatch(testDb, match.id, lockTime)
  await advanceMatch(testDb, match.id, new Date('2027-03-30T20:30:00Z'))
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'played' })

  const now = new Date('2027-03-31T10:00:00Z')
  const result = await runTick(testDb, now, transport)
  const second = await runTick(testDb, now, transport)

  expect(result.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  const dates = await testDb
    .select({ matchDate: matches.matchDate })
    .from(matches)
    .orderBy(matches.matchDate)
  expect(dates.map((d) => d.matchDate)).toEqual(['2027-03-30', '2027-04-06'])
})

it('expires an expired offer before lock and counts it once', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const [member] = await testDb.insert(users).values({ name: 'Only' }).returning()
  const now = new Date('2027-03-29T10:00:00Z')
  await testDb.insert(entries).values([
    { matchId: match.id, kind: 'member', memberId: member.id, status: 'offered', offerExpiresAt: now },
  ])

  const a = await runTick(testDb, now, transport)
  const b = await runTick(testDb, now, transport)

  expect(a.expiredOffers).toBe(1)
  expect(b.expiredOffers).toBe(0)
})

it('draws the bag duty once at kickoff minus one hour and notifies the roster', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30') // kickoff 20:00 Asia/Jerusalem
  await subscribeAndConfirm(match.id, 3)

  const before = await runTick(testDb, new Date('2027-03-30T15:59:00Z'), transport)
  const at = await runTick(testDb, new Date('2027-03-30T16:00:00Z'), transport)
  const again = await runTick(testDb, new Date('2027-03-30T16:10:00Z'), transport)

  expect(before.bagDuties).toBe(0)
  expect(at.bagDuties).toBe(1)
  expect(at.notificationsSent).toBe(3)
  expect(again.bagDuties).toBe(0)
  expect(again.notificationsSent).toBe(0)
  expect(await testDb.select().from(bagDuties)).toHaveLength(1)
})

it('draws lazily on page load and the tick still sends the push', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await subscribeAndConfirm(match.id, 3)
  const at = new Date('2027-03-30T16:00:00Z')

  await advanceMatch(testDb, match.id, at)
  expect(await testDb.select().from(bagDuties)).toHaveLength(1)
  expect(transport).not.toHaveBeenCalled()

  const tick = await runTick(testDb, at, transport)
  expect(tick.bagDuties).toBe(0)
  expect(tick.notificationsSent).toBe(3)
})
