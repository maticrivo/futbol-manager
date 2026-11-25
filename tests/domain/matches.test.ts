import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { auditLog, charges, entries, guestPayments, matches, users } from '@/db/schema'
import {
  getSettings,
  updateSettings,
  createMatchForDate,
  createMatchForDateIfAbsent,
  createNextMatch,
  deleteMatch,
  getUpcomingMatch,
  getMatch,
  listUpcomingMatches,
} from '@/domain/matches'

beforeEach(resetDb)

it('returns the documented defaults', async () => {
  expect(await getSettings(testDb)).toEqual({
    capacity: 14,
    costAgorot: 3500,
    venue: 'Onim (אונים)',
    venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6',
    kickoffTime: '20:00',
    queueWindowMinutes: 30,
  })
})

it('creates a Tuesday match with all phase times', async () => {
  const m = await createMatchForDate(testDb, '2027-03-30')
  expect(m.matchDate).toBe('2027-03-30')
  expect(m.capacity).toBe(14)
  expect(m.costAgorot).toBe(3500)
  expect(m.venue).toBe('Onim (אונים)')
  expect(m.venueUrl).toBe('https://maps.app.goo.gl/WPPALMNQFfW3MX7L6')
  expect(m.kickoffAt.toISOString()).toBe('2027-03-30T17:00:00.000Z')
  expect(m.lockAt.toISOString()).toBe('2027-03-30T11:00:00.000Z')
})

it('is idempotent per date', async () => {
  const a = await createMatchForDate(testDb, '2027-03-30')
  const b = await createMatchForDate(testDb, '2027-03-30')
  expect(b.id).toBe(a.id)
})

it('createMatchForDateIfAbsent reports created once per date', async () => {
  const first = await createMatchForDateIfAbsent(testDb, '2027-03-30')
  expect(first.created).toBe(true)

  const second = await createMatchForDateIfAbsent(testDb, '2027-03-30')
  expect(second.created).toBe(false)
  expect(second.match.id).toBe(first.match.id)
})

it('creates the next match once and never recreates a cancelled date', async () => {
  const m = await createMatchForDate(testDb, '2027-03-30')
  const next = await createNextMatch(testDb, m.id)
  expect(next?.matchDate).toBe('2027-04-06')
  expect(await createNextMatch(testDb, m.id)).toBeNull()

  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, next!.id))
  const m2 = await createMatchForDate(testDb, '2027-04-13')
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, m2.id))
  const after = await createNextMatch(testDb, m.id)
  expect(after).toBeNull()
})

describe('settings management', () => {
  it('updates settings when called by admin and writes audit log', async () => {
    const [admin] = await testDb.insert(users).values({ name: 'Admin', role: 'admin' }).returning()

    const res = await updateSettings(testDb, admin.id, {
      capacity: 16,
      venue: 'Kraft Stadium',
      kickoffTime: '21:00',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value).toEqual({
      capacity: 16,
      costAgorot: 3500,
      venue: 'Kraft Stadium',
      venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6',
      kickoffTime: '21:00',
      queueWindowMinutes: 30,
    })

    const persisted = await getSettings(testDb)
    expect(persisted).toEqual(res.value)

    const audits = await testDb.select().from(auditLog).where(eq(auditLog.action, 'settings.update'))
    expect(audits).toHaveLength(1)
    expect(audits[0].actorId).toBe(admin.id)
    expect(audits[0].entity).toBe('settings')
    expect(audits[0].detail).toEqual({
      capacity: 16,
      venue: 'Kraft Stadium',
      kickoffTime: '21:00',
    })
  })

  it('rejects updates from non-admin or nonexistent users with FORBIDDEN', async () => {
    const [user] = await testDb.insert(users).values({ name: 'Player', role: 'member' }).returning()

    const forbiddenRes = await updateSettings(testDb, user.id, { capacity: 16 })
    expect(forbiddenRes).toEqual({ ok: false, code: 'FORBIDDEN' })

    const nonexistentRes = await updateSettings(testDb, '00000000-0000-4000-8000-000000000000', { capacity: 16 })
    expect(nonexistentRes).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it('validates settings boundaries and types with INVALID_SETTING', async () => {
    const [admin] = await testDb.insert(users).values({ name: 'Admin', role: 'admin' }).returning()

    expect(await updateSettings(testDb, admin.id, { capacity: 0 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { capacity: 41 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { costAgorot: 0 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { costAgorot: -100 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { kickoffTime: '25:00' })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { kickoffTime: 'invalid' })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { queueWindowMinutes: 4 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
    expect(await updateSettings(testDb, admin.id, { queueWindowMinutes: 1441 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
  })
})

describe('getUpcomingMatch and getMatch', () => {
  it('finds match by id', async () => {
    const created = await createMatchForDate(testDb, '2027-03-30')
    const found = await getMatch(testDb, created.id)
    expect(found?.id).toBe(created.id)

    expect(await getMatch(testDb, 999999)).toBeNull()
  })

  it('returns the earliest scheduled or locked match within kickoff >= now - 6h', async () => {
    const m = await createMatchForDate(testDb, '2027-03-30')
    const kickoff = m.kickoffAt.getTime()

    // 5 hours after kickoff -> still upcoming
    const fiveHoursAfter = new Date(kickoff + 5 * 3600 * 1000)
    expect((await getUpcomingMatch(testDb, fiveHoursAfter))?.id).toBe(m.id)

    // exactly 6 hours after kickoff -> still upcoming
    const sixHoursAfter = new Date(kickoff + 6 * 3600 * 1000)
    expect((await getUpcomingMatch(testDb, sixHoursAfter))?.id).toBe(m.id)

    // 6 hours and 1 minute after kickoff -> rolls past
    const pastThreshold = new Date(kickoff + (6 * 3600 + 60) * 1000)
    expect(await getUpcomingMatch(testDb, pastThreshold)).toBeNull()

    // Status 'locked' is also considered upcoming
    await testDb.update(matches).set({ status: 'locked' }).where(eq(matches.id, m.id))
    expect((await getUpcomingMatch(testDb, fiveHoursAfter))?.id).toBe(m.id)

    // Status 'played' or 'cancelled' is ignored
    await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, m.id))
    expect(await getUpcomingMatch(testDb, fiveHoursAfter)).toBeNull()

    await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, m.id))
    expect(await getUpcomingMatch(testDb, fiveHoursAfter)).toBeNull()
  })
})

it('treats a concurrent create of the same date as already done', async () => {
  const results = await Promise.all([
    createMatchForDateIfAbsent(testDb, '2027-03-30'),
    createMatchForDateIfAbsent(testDb, '2027-03-30'),
  ])
  expect(results.filter(r => r.created)).toHaveLength(1)
})

describe('listUpcomingMatches', () => {
  it('lists every upcoming match in kickoff order, including cancelled ones', async () => {
    const past = await createMatchForDate(testDb, '2027-02-23')
    const first = await createMatchForDate(testDb, '2027-03-30')
    const second = await createMatchForDate(testDb, '2027-04-06')
    const cancelled = await createMatchForDate(testDb, '2027-04-13')
    await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, cancelled.id))

    const now = new Date('2027-03-01T00:00:00Z')
    const list = await listUpcomingMatches(testDb, now)

    expect(list.map(m => m.id)).toEqual([first.id, second.id, cancelled.id])
    expect(list.map(m => m.id)).not.toContain(past.id)
  })
})

describe('deleteMatch', () => {
  it('removes the match with its entries, charges and guest payments, and writes an audit log', async () => {
    const [admin, member] = await testDb.insert(users)
      .values([{ name: 'Admin', role: 'admin' }, { name: 'Member' }]).returning()
    const match = await createMatchForDate(testDb, '2027-03-30')

    await testDb.insert(entries).values({ matchId: match.id, kind: 'member', memberId: member.id })
    const [guest] = await testDb.insert(entries)
      .values({ matchId: match.id, kind: 'guest', guestName: 'Guest', hostMemberId: member.id }).returning()
    await testDb.insert(charges).values({
      matchId: match.id, memberId: member.id, billingMonth: '2027-03', amountAgorot: 3500,
    })
    await testDb.insert(guestPayments).values({
      entryId: guest.id, amountAgorot: 3500, kind: 'payment', paidAt: new Date(), recordedBy: admin.id,
    })

    const result = await deleteMatch(testDb, { actorId: admin.id, matchId: match.id, now: new Date() })
    expect(result.ok).toBe(true)

    expect(await getMatch(testDb, match.id)).toBeNull()
    expect(await testDb.select().from(entries).where(eq(entries.matchId, match.id))).toHaveLength(0)
    expect(await testDb.select().from(charges).where(eq(charges.matchId, match.id))).toHaveLength(0)
    expect(await testDb.select().from(guestPayments)).toHaveLength(0)

    const audits = await testDb.select().from(auditLog).where(eq(auditLog.action, 'match.delete'))
    expect(audits).toHaveLength(1)
    expect(audits[0].entityId).toBe(String(match.id))
  })

  it('rejects non-admins and missing matches', async () => {
    const [admin, user] = await testDb.insert(users)
      .values([{ name: 'Admin', role: 'admin' }, { name: 'Player', role: 'member' }]).returning()
    const match = await createMatchForDate(testDb, '2027-03-30')
    const now = new Date()

    expect(await deleteMatch(testDb, { actorId: user.id, matchId: match.id, now }))
      .toEqual({ ok: false, code: 'FORBIDDEN' })
    expect(await deleteMatch(testDb, { actorId: '00000000-0000-4000-8000-000000000000', matchId: match.id, now }))
      .toEqual({ ok: false, code: 'FORBIDDEN' })
    expect(await deleteMatch(testDb, { actorId: admin.id, matchId: 999999, now }))
      .toEqual({ ok: false, code: 'NOT_FOUND' })
    expect(await getMatch(testDb, match.id)).not.toBeNull()
  })
})
