import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { auditLog, charges, entries, matches, members } from '@/db/schema'
import { addGuest, signup, withdraw } from '@/domain/entries'
import { adminAddEntry, adminRemoveEntry, advanceMatch, lockMatch, restoreCharge, setAttendance, waiveCharge } from '@/domain/lock'
import { createMatchForDate, getMatch } from '@/domain/matches'
import { joinQueue } from '@/domain/queue'
import { resetDb, testDb } from '../db'

const lockTime = new Date('2027-03-30T11:00:00Z')
const guestOpen = new Date('2027-03-29T11:00:00Z')
beforeEach(resetDb)

async function setup() {
  const [admin] = await testDb.insert(members).values({ name: 'Admin', role: 'admin' }).$returningId()
  const players = await testDb.insert(members)
    .values(Array.from({ length: 14 }, (_, i) => ({ name: `Player ${i}` }))).$returningId()
  const match = await createMatchForDate(testDb, '2027-03-30')
  const roster = []
  for (const { id: memberId } of players.slice(0, 3)) {
    const signed = await signup(testDb, { memberId, matchId: match.id, now: guestOpen })
    if (!signed.ok) throw new Error(signed.code)
    roster.push(signed.value)
  }
  const guest = await addGuest(testDb, { hostMemberId: players[0].id, matchId: match.id, name: 'Guest', now: guestOpen })
  if (!guest.ok) throw new Error(guest.code)
  return { match, people: { admin, member: players[0], extra: players[3], next: players[4] }, roster, guest: guest.value }
}

function matchCharges(matchId: number) {
  return testDb.select().from(charges).where(eq(charges.matchId, matchId)).orderBy(charges.memberId)
}

function logs(action: string) {
  return testDb.select().from(auditLog).where(eq(auditLog.action, action))
}

it('charges confirmed members once, including no-shows, and never guests', async () => {
  const { match, roster } = await setup()
  await testDb.update(entries).set({ attended: false }).where(eq(entries.id, roster[0].id))
  const first = await lockMatch(testDb, match.id, lockTime)
  const second = await lockMatch(testDb, match.id, lockTime)
  expect(first).toEqual({ ok: true, value: { chargesCreated: 3 } })
  expect(second).toEqual({ ok: true, value: { chargesCreated: 0 } })
  const rows = await matchCharges(match.id)
  expect(rows.map(row => row.memberId)).toEqual(roster.map(entry => entry.memberId))
  for (const row of rows) {
    expect(row).toMatchObject({ billingMonth: '2027-03', amountAgorot: 3500, status: 'charged' })
  }
  expect(await logs('match.lock')).toHaveLength(1)
})

it('expires both a queued entry and an unexpired offer at lock, without charging either', async () => {
  const { match, people, roster, guest } = await setup()
  await testDb.update(matches).set({ capacity: 4 }).where(eq(matches.id, match.id))
  const now = new Date('2027-03-30T10:55:00Z')
  const offered = await joinQueue(testDb, { memberId: people.extra.id, matchId: match.id, now })
  const queued = await joinQueue(testDb, { memberId: people.next.id, matchId: match.id, now })
  if (!offered.ok || !queued.ok) throw new Error('Could not join queue')
  expect((await withdraw(testDb, { entryId: roster[0].id, actorMemberId: people.member.id, now })).ok).toBe(true)

  const read = async (id: number) => (await testDb.select().from(entries).where(eq(entries.id, id)))[0]
  expect(await read(offered.value.id)).toMatchObject({
    status: 'offered', offerExpiresAt: new Date('2027-03-30T11:25:00Z'),
  })
  expect(await read(queued.value.id)).toMatchObject({ status: 'queued' })

  expect(await lockMatch(testDb, match.id, lockTime)).toEqual({ ok: true, value: { chargesCreated: 2 } })
  expect(await read(offered.value.id)).toMatchObject({ status: 'expired' })
  expect(await read(queued.value.id)).toMatchObject({ status: 'expired' })
  expect((await matchCharges(match.id)).map(row => row.memberId)).toEqual(roster.slice(1).map(entry => entry.memberId))
  expect(await adminRemoveEntry(testDb, {
    actorId: people.admin.id, entryId: guest.id, now: lockTime, reason: 'guest dropped',
  })).toMatchObject({ ok: true, value: { status: 'removed' } })
  expect(await read(queued.value.id)).toMatchObject({ status: 'expired' })
  expect((await matchCharges(match.id)).map(row => row.status)).toEqual(['charged', 'charged'])
})

it('requires a reason and an admin to waive, and audits it', async () => {
  const { match, people } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const [charge] = await matchCharges(match.id)
  const denied = await waiveCharge(testDb, { actorId: people.member.id, chargeId: charge.id, reason: 'sub' })
  expect(denied).toEqual({ ok: false, code: 'FORBIDDEN' })
  const empty = await waiveCharge(testDb, { actorId: people.admin.id, chargeId: charge.id, reason: '  ' })
  expect(empty).toEqual({ ok: false, code: 'INVALID_REASON' })
  const input = { actorId: people.admin.id, chargeId: charge.id, reason: '  substitute found  ' }
  const waived = await waiveCharge(testDb, input)
  expect(waived).toMatchObject({ ok: true, value: { status: 'waived', waivedBy: people.admin.id, waiveReason: 'substitute found' } })
  expect(await waiveCharge(testDb, input)).toEqual({ ok: false, code: 'ALREADY_WAIVED' })
  expect(await logs('charge.waive')).toMatchObject([{
    actorId: people.admin.id, entityId: String(charge.id), detail: { reason: 'substitute found' }, createdAt: expect.any(Date),
  }])
})

it('charges added members and waives removed members after lock even if the roster was full', async () => {
  const { match, people } = await setup()
  await testDb.update(matches).set({ capacity: 4 }).where(eq(matches.id, match.id))
  const input = { actorId: people.admin.id, matchId: match.id, memberId: people.extra.id, now: guestOpen, reason: '' }
  expect(await adminAddEntry(testDb, input)).toEqual({ ok: false, code: 'FULL' })

  await lockMatch(testDb, match.id, lockTime)
  expect(await adminAddEntry(testDb, { ...input, now: lockTime, reason: '  ' })).toEqual({ ok: false, code: 'INVALID_REASON' })
  const added = await adminAddEntry(testDb, { ...input, now: lockTime, reason: 'replacement' })
  if (!added.ok) throw new Error(added.code)
  const [addedCharge] = await testDb.select().from(charges).where(eq(charges.memberId, people.extra.id))
  expect(addedCharge).toMatchObject({ status: 'charged', amountAgorot: 3500, billingMonth: '2027-03' })
  const removed = await adminRemoveEntry(testDb, { actorId: people.admin.id, entryId: added.value.id, now: lockTime, reason: ' dropped ' })
  expect(removed).toMatchObject({ ok: true, value: { status: 'removed' } })
  const [charge] = await testDb.select().from(charges).where(eq(charges.memberId, people.extra.id))
  expect(charge).toMatchObject({ status: 'waived', waivedBy: people.admin.id, waiveReason: 'dropped' })
  expect(await logs('entry.admin_add')).toMatchObject([{ detail: { reason: 'replacement' } }])
  expect(await logs('entry.admin_remove')).toMatchObject([{ detail: { reason: 'dropped' } }])

  const readded = await adminAddEntry(testDb, { ...input, now: lockTime, reason: 'returned' })
  expect(readded).toMatchObject({ ok: true, value: { id: added.value.id, status: 'confirmed' } })
  expect(await testDb.select().from(charges).where(eq(charges.memberId, people.extra.id))).toMatchObject([{
    id: charge.id, status: 'charged', waivedBy: null, waiveReason: null,
  }])
})

it('restores only waived charges and clears the waiver metadata', async () => {
  const { match, people } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const [charge] = await matchCharges(match.id)
  const input = { actorId: people.admin.id, chargeId: charge.id }
  expect(await restoreCharge(testDb, input)).toEqual({ ok: false, code: 'NOT_WAIVED' })
  expect((await waiveCharge(testDb, { ...input, reason: 'sub' }, lockTime)).ok).toBe(true)
  expect(await restoreCharge(testDb, { ...input, actorId: people.member.id })).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await restoreCharge(testDb, input)).toMatchObject({
    ok: true, value: { status: 'charged', waivedBy: null, waiveReason: null },
  })
  expect((await matchCharges(match.id))[0]).toMatchObject({ status: 'charged', waivedBy: null, waiveReason: null })
  expect(await logs('charge.restore')).toMatchObject([{ actorId: people.admin.id, entityId: String(charge.id) }])
})

it('sets attendance only for a confirmed entry as admin, without changing the charge', async () => {
  const { match, people, roster } = await setup()
  const [entry, other] = roster
  await withdraw(testDb, { entryId: other.id, actorMemberId: other.memberId!, now: guestOpen })
  await lockMatch(testDb, match.id, lockTime)
  const input = { actorId: people.admin.id, entryId: entry.id, attended: false }
  const before = await matchCharges(match.id)
  expect(await setAttendance(testDb, { ...input, actorId: people.member.id })).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await setAttendance(testDb, { ...input, entryId: 999 })).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setAttendance(testDb, { ...input, entryId: other.id })).toEqual({ ok: false, code: 'NOT_CONFIRMED' })
  expect(await setAttendance(testDb, input)).toMatchObject({ ok: true, value: { attended: false } })
  expect(await testDb.select().from(entries).where(eq(entries.id, entry.id))).toMatchObject([{ attended: false }])
  expect(await matchCharges(match.id)).toEqual(before)
  expect(await logs('entry.attendance')).toMatchObject([{ entityId: String(entry.id), detail: { attended: false } }])
})

it('advances matches repeatedly and concurrently without duplicate charges or premature play', async () => {
  const { match } = await setup()
  expect(await lockMatch(testDb, match.id, guestOpen)).toEqual({ ok: true, value: { chargesCreated: 0 } })
  await advanceMatch(testDb, match.id, guestOpen)
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'scheduled' })
  await Promise.all([advanceMatch(testDb, match.id, lockTime), advanceMatch(testDb, match.id, lockTime)])
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'locked' })
  expect(await matchCharges(match.id)).toHaveLength(3)
  expect(await logs('match.lock')).toHaveLength(1)

  const playTime = match.kickoffAt.getTime() + 3 * 60 * 60_000
  await advanceMatch(testDb, match.id, new Date(playTime - 1))
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'locked' })
  await Promise.all([advanceMatch(testDb, match.id, new Date(playTime)), advanceMatch(testDb, match.id, new Date(playTime))])
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'played' })
  await expect(advanceMatch(testDb, 999, lockTime)).resolves.toBeUndefined()
})
