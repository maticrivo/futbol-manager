import { and, eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { auditLog, bagDuties, entries, matches, users } from '@/db/schema'
import { ensureBagDuty, getBagCredits, recordBagTaker } from '@/domain/bag'
import { addGuest, signup } from '@/domain/entries'
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

const signupNow = new Date('2027-03-27T10:00:00Z')

async function signedUpMatch(matchDate: string, names: string[]): Promise<{ matchId: number; ids: string[] }> {
  const match = await createMatchForDate(testDb, matchDate)
  const ids = names.length ? await makeMembers(...names) : []
  for (const id of ids) {
    const signed = await signup(testDb, { memberId: id, matchId: match.id, now: signupNow })
    if (!signed.ok) throw new Error(signed.code)
  }
  return { matchId: match.id, ids }
}

async function kickoffOf(matchId: number): Promise<Date> {
  const [match] = await testDb.select().from(matches).where(eq(matches.id, matchId))
  return match.kickoffAt
}

const oneHourBefore = (kickoff: Date) => new Date(kickoff.getTime() - 60 * 60_000)

it('draws nobody before the hour before kickoff', async () => {
  const { matchId } = await signedUpMatch('2027-03-30', ['Ana'])
  const early = new Date(oneHourBefore(await kickoffOf(matchId)).getTime() - 1)
  expect((await ensureBagDuty(testDb, { matchId, now: early })).duty).toBeNull()
})

it('assigns a member and a different backup', async () => {
  const { matchId, ids } = await signedUpMatch('2027-03-30', ['Ana', 'Beto'])
  const result = await ensureBagDuty(testDb, { matchId, now: oneHourBefore(await kickoffOf(matchId)), random: () => 0 })
  expect(result.created).toBe(true)
  expect(ids).toContain(result.duty?.assignedMemberId)
  expect(result.duty?.backupMemberId).not.toBe(result.duty?.assignedMemberId)
})

it('picks the never-credited member over a credited one', async () => {
  const [ana, beto] = await makeMembers('Ana', 'Beto')
  await setDuty('2027-03-23', ana, null)
  const match = await createMatchForDate(testDb, '2027-03-30')
  for (const id of [ana, beto]) await signup(testDb, { memberId: id, matchId: match.id, now: signupNow })
  const result = await ensureBagDuty(testDb, {
    matchId: match.id, now: oneHourBefore(match.kickoffAt), random: () => 0,
  })
  expect(result.duty?.assignedMemberId).toBe(beto)
})

it('repeats with whoever took it longest ago once everyone has taken it', async () => {
  const [ana, beto] = await makeMembers('Ana', 'Beto')
  await setDuty('2027-03-09', ana, null)
  await setDuty('2027-03-23', beto, null)
  const match = await createMatchForDate(testDb, '2027-03-30')
  for (const id of [ana, beto]) await signup(testDb, { memberId: id, matchId: match.id, now: signupNow })
  const result = await ensureBagDuty(testDb, { matchId: match.id, now: oneHourBefore(match.kickoffAt) })
  expect(result.duty?.assignedMemberId).toBe(ana)
})

it('never draws twice, even if the assignee leaves the roster', async () => {
  const { matchId } = await signedUpMatch('2027-03-30', ['Ana', 'Beto'])
  const at = oneHourBefore(await kickoffOf(matchId))
  const first = await ensureBagDuty(testDb, { matchId, now: at, random: () => 0 })
  await testDb.update(entries).set({ status: 'removed' })
    .where(and(eq(entries.matchId, matchId), eq(entries.memberId, first.duty!.assignedMemberId)))
  const second = await ensureBagDuty(testDb, { matchId, now: at })
  expect(first.created).toBe(true)
  expect(second.created).toBe(false)
  expect(second.duty?.id).toBe(first.duty?.id)
  expect(second.duty?.assignedMemberId).toBe(first.duty?.assignedMemberId)
})

it('leaves no backup when only one member is signed up', async () => {
  const { matchId } = await signedUpMatch('2027-03-30', ['Ana'])
  const result = await ensureBagDuty(testDb, { matchId, now: oneHourBefore(await kickoffOf(matchId)) })
  expect(result.duty?.backupMemberId).toBeNull()
})

it('ignores guests and cancelled matches', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const [host] = await makeMembers('Host')
  await addGuest(testDb, { hostMemberId: host, matchId: match.id, name: 'Guest', now: new Date('2027-03-29T12:00:00Z') })
  expect((await ensureBagDuty(testDb, { matchId: match.id, now: oneHourBefore(match.kickoffAt) })).duty).toBeNull()

  const other = await createMatchForDate(testDb, '2027-04-06')
  const [ana] = await makeMembers('Ana')
  await signup(testDb, { memberId: ana, matchId: other.id, now: signupNow })
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, other.id))
  expect((await ensureBagDuty(testDb, { matchId: other.id, now: oneHourBefore(other.kickoffAt) })).duty).toBeNull()

  const played = await createMatchForDate(testDb, '2027-04-13')
  await signup(testDb, { memberId: ana, matchId: played.id, now: signupNow })
  await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, played.id))
  expect((await ensureBagDuty(testDb, { matchId: played.id, now: oneHourBefore(played.kickoffAt) })).duty).toBeNull()
})

it('lets an admin record and correct who took the bag', async () => {
  const [admin, ana, beto] = await makeMembers('Boss', 'Ana', 'Beto')
  await testDb.update(users).set({ role: 'admin' }).where(eq(users.id, admin))
  const match = await createMatchForDate(testDb, '2027-03-30')
  for (const id of [ana, beto]) await signup(testDb, { memberId: id, matchId: match.id, now: signupNow })
  await ensureBagDuty(testDb, { matchId: match.id, now: oneHourBefore(match.kickoffAt) })

  const early = await recordBagTaker(testDb, {
    actorId: admin, matchId: match.id, memberId: ana, now: oneHourBefore(match.kickoffAt),
  })
  expect(early).toEqual({ ok: false, code: 'TOO_EARLY' })

  const recorded = await recordBagTaker(testDb, { actorId: admin, matchId: match.id, memberId: ana, now: match.kickoffAt })
  expect(recorded.ok && recorded.value.actualMemberId).toBe(ana)

  const corrected = await recordBagTaker(testDb, { actorId: admin, matchId: match.id, memberId: beto, now: match.kickoffAt })
  expect(corrected.ok && corrected.value.actualMemberId).toBe(beto)
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'bag.record'))).toHaveLength(2)
})

it('rejects non-admins and non-roster members, and allows clearing', async () => {
  const [admin, ana, outsider] = await makeMembers('Boss', 'Ana', 'Outsider')
  await testDb.update(users).set({ role: 'admin' }).where(eq(users.id, admin))
  const match = await createMatchForDate(testDb, '2027-03-30')
  await signup(testDb, { memberId: ana, matchId: match.id, now: signupNow })
  await ensureBagDuty(testDb, { matchId: match.id, now: oneHourBefore(match.kickoffAt) })

  expect(await recordBagTaker(testDb, { actorId: ana, matchId: match.id, memberId: ana, now: match.kickoffAt }))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await recordBagTaker(testDb, { actorId: admin, matchId: match.id, memberId: outsider, now: match.kickoffAt }))
    .toEqual({ ok: false, code: 'NOT_IN_ROSTER' })
  const cleared = await recordBagTaker(testDb, { actorId: admin, matchId: match.id, memberId: null, now: match.kickoffAt })
  expect(cleared.ok && cleared.value.actualMemberId).toBeNull()
})
