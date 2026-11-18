import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { auditLog, charges, entries, matches, members } from '@/db/schema'
import { addGuest, signup, withdraw } from '@/domain/entries'
import { adminAddEntry, adminRemoveEntry, advanceMatch, lockMatch, restoreCharge, setAttendance, waiveCharge } from '@/domain/lock'
import { createMatchForDate, getMatch } from '@/domain/matches'
import { joinQueue } from '@/domain/queue'
import { resetDb, testDb } from '../db'
import { waitForLockWait } from '../lock-wait'

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
  expect(await logs('match.lock')).toMatchObject([{ createdAt: lockTime }])
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
  const waived = await waiveCharge(testDb, input, lockTime)
  expect(waived).toMatchObject({ ok: true, value: { status: 'waived', waivedBy: people.admin.id, waiveReason: 'substitute found' } })
  expect(await waiveCharge(testDb, input)).toEqual({ ok: false, code: 'ALREADY_WAIVED' })
  expect(await logs('charge.waive')).toMatchObject([{
    actorId: people.admin.id, entity: 'charge', entityId: String(charge.id),
    detail: { reason: 'substitute found' }, createdAt: lockTime,
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
  expect(await logs('charge.waive')).toMatchObject([{
    actorId: people.admin.id, entity: 'charge', entityId: String(charge.id), createdAt: lockTime,
    detail: { reason: 'dropped', source: 'entry.admin_remove', entryId: added.value.id },
  }])
  expect(await logs('entry.admin_add')).toMatchObject([{ detail: { reason: 'replacement' }, createdAt: lockTime }])
  expect(await logs('entry.admin_remove')).toMatchObject([{ detail: { reason: 'dropped' }, createdAt: lockTime }])

  // A recharge preserves the saved snapshot even if the match details change.
  const readdTime = new Date('2027-04-01T00:00:00Z')
  await testDb.update(matches).set({ costAgorot: 9000, kickoffAt: readdTime }).where(eq(matches.id, match.id))
  const readded = await adminAddEntry(testDb, { ...input, now: readdTime, reason: 'returned' })
  expect(readded).toMatchObject({ ok: true, value: { id: added.value.id, status: 'confirmed' } })
  expect(await testDb.select().from(charges).where(eq(charges.memberId, people.extra.id))).toMatchObject([{
    id: charge.id, status: 'charged', waivedBy: null, waiveReason: null, amountAgorot: 3500, billingMonth: '2027-03',
  }])
})

it('preserves an existing waiver when another admin removes that member', async () => {
  const { match, people, roster } = await setup()
  const [otherAdmin] = await testDb.insert(members).values({ name: 'Other admin', role: 'admin' }).$returningId()
  await lockMatch(testDb, match.id, lockTime)
  const [charge] = await matchCharges(match.id)
  const waiverTime = new Date('2027-03-30T12:00:00Z')
  const removalTime = new Date('2027-03-30T12:01:00Z')
  expect((await waiveCharge(testDb, { actorId: people.admin.id, chargeId: charge.id, reason: 'original' }, waiverTime)).ok).toBe(true)
  expect(await adminRemoveEntry(testDb, {
    actorId: otherAdmin.id, entryId: roster[0].id, reason: 'removed later', now: removalTime,
  })).toMatchObject({ ok: true, value: { status: 'removed' } })
  expect((await matchCharges(match.id))[0]).toMatchObject({
    status: 'waived', waivedBy: people.admin.id, waiveReason: 'original',
  })
  expect(await logs('charge.waive')).toMatchObject([{
    actorId: people.admin.id, entityId: String(charge.id), createdAt: waiverTime,
  }])
  expect(await logs('entry.admin_remove')).toMatchObject([{
    actorId: otherAdmin.id, detail: { reason: 'removed later' }, createdAt: removalTime,
  }])
})

it('blocks removal on played and cancelled matches and leaves the entry confirmed', async () => {
  const { match, people, roster } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const entryId = roster[0].id

  await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, match.id))
  expect(await adminRemoveEntry(testDb, { actorId: people.admin.id, entryId, now: lockTime, reason: 'x' }))
    .toEqual({ ok: false, code: 'MATCH_FINISHED' })
  expect((await testDb.select().from(entries).where(eq(entries.id, entryId)))[0].status).toBe('confirmed')

  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  expect(await adminRemoveEntry(testDb, { actorId: people.admin.id, entryId, now: lockTime, reason: 'x' }))
    .toEqual({ ok: false, code: 'MATCH_FINISHED' })
  expect((await testDb.select().from(entries).where(eq(entries.id, entryId)))[0].status).toBe('confirmed')
})

it('rejects attendance on a cancelled match but allows it after play', async () => {
  const { match, people, roster } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const entryId = roster[0].id

  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, match.id))
  expect(await setAttendance(testDb, { actorId: people.admin.id, entryId, attended: true }, lockTime))
    .toEqual({ ok: false, code: 'MATCH_FINISHED' })

  await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, match.id))
  expect(await setAttendance(testDb, { actorId: people.admin.id, entryId, attended: true }, lockTime))
    .toMatchObject({ ok: true, value: { attended: true } })
})

it('rejects reasons longer than 255 characters after trimming', async () => {
  const { match, people, roster } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const [charge] = await matchCharges(match.id)
  const actorId = people.admin.id
  const reason = ` ${'x'.repeat(256)} `
  const invalid = { ok: false, code: 'INVALID_REASON' }
  expect(await waiveCharge(testDb, { actorId, chargeId: charge.id, reason }, lockTime)).toEqual(invalid)
  expect(await adminAddEntry(testDb, { actorId, matchId: match.id, memberId: people.extra.id, now: lockTime, reason })).toEqual(invalid)
  expect(await adminRemoveEntry(testDb, { actorId, entryId: roster[0].id, now: lockTime, reason })).toEqual(invalid)
  const allowed = 'x'.repeat(255)
  expect(await waiveCharge(testDb, { actorId, chargeId: charge.id, reason: ` ${allowed} ` }, lockTime))
    .toMatchObject({ ok: true, value: { waiveReason: allowed } })
})

it('bounds an optional scheduled-add reason without requiring one', async () => {
  const { match, people } = await setup()
  const input = { actorId: people.admin.id, matchId: match.id, memberId: people.extra.id, now: guestOpen }
  expect(await adminAddEntry(testDb, { ...input, reason: ` ${'x'.repeat(256)} ` }))
    .toEqual({ ok: false, code: 'INVALID_REASON' })
  expect(await logs('entry.admin_add')).toEqual([])

  const maxReason = 'x'.repeat(255)
  expect(await adminAddEntry(testDb, { ...input, reason: ` ${maxReason} ` })).toMatchObject({ ok: true })
  expect(await adminAddEntry(testDb, { ...input, memberId: people.next.id, reason: '  ' })).toMatchObject({ ok: true })
  expect((await logs('entry.admin_add')).map(row => row.detail)).toEqual([{ reason: maxReason }, { reason: '' }])
})

it('bills the kickoff month when processed in the following month', async () => {
  const { match } = await setup()
  const now = new Date('2027-04-01T00:00:00Z')
  expect(await lockMatch(testDb, match.id, now)).toEqual({ ok: true, value: { chargesCreated: 3 } })
  expect((await matchCharges(match.id)).map(charge => charge.billingMonth)).toEqual(['2027-03', '2027-03', '2027-03'])
})

it('restores only waived charges and clears the waiver metadata', async () => {
  const { match, people } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const [charge] = await matchCharges(match.id)
  const input = { actorId: people.admin.id, chargeId: charge.id }
  expect(await restoreCharge(testDb, input)).toEqual({ ok: false, code: 'NOT_WAIVED' })
  expect((await waiveCharge(testDb, { ...input, reason: 'sub' }, lockTime)).ok).toBe(true)
  expect(await restoreCharge(testDb, { ...input, actorId: people.member.id })).toEqual({ ok: false, code: 'FORBIDDEN' })
  const restoreTime = new Date('2027-03-30T12:00:00Z')
  expect(await restoreCharge(testDb, input, restoreTime)).toMatchObject({
    ok: true, value: { status: 'charged', waivedBy: null, waiveReason: null },
  })
  expect((await matchCharges(match.id))[0]).toMatchObject({ status: 'charged', waivedBy: null, waiveReason: null })
  expect(await logs('charge.restore')).toMatchObject([{
    actorId: people.admin.id, entityId: String(charge.id), createdAt: restoreTime,
  }])
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
  expect(await setAttendance(testDb, input, lockTime)).toMatchObject({ ok: true, value: { attended: false } })
  expect(await testDb.select().from(entries).where(eq(entries.id, entry.id))).toMatchObject([{ attended: false }])
  expect(await matchCharges(match.id)).toEqual(before)
  expect(await logs('entry.attendance')).toMatchObject([{
    entityId: String(entry.id), detail: { attended: false }, createdAt: lockTime,
  }])
})

it('refuses an admin mutation after waiting for a concurrent demotion to commit', async () => {
  const { people, roster } = await setup()
  const actorId = people.admin.id
  const entryId = roster[0].id
  const holder = await testDb.$client.getConnection()
  let attendance: ReturnType<typeof setAttendance> | undefined
  try {
    await holder.beginTransaction()
    await holder.execute('UPDATE members SET role = ? WHERE id = ?', ['member', actorId])
    attendance = setAttendance(testDb, { actorId, entryId, attended: true }, lockTime)
    void attendance.catch(() => {})
    await waitForLockWait(`select \`role\` from \`members\` where \`members\`.\`id\` = ${actorId}`)
    await holder.commit()

    expect(await attendance).toEqual({ ok: false, code: 'FORBIDDEN' })
    expect(await testDb.select().from(entries).where(eq(entries.id, entryId))).toMatchObject([{ attended: null }])
    expect(await logs('entry.attendance')).toEqual([])
  } finally {
    try {
      await holder.rollback()
    } finally {
      holder.release()
      await Promise.allSettled([attendance])
    }
  }
}, 10_000)

it.each([1, 2, 3, 4, 5])('serializes billing and removal by a billed admin (run %i)', async () => {
  const { match, people, roster } = await setup()
  const actorId = people.admin.id
  const target = roster[0]
  expect(await signup(testDb, { memberId: actorId, matchId: match.id, now: guestOpen }))
    .toMatchObject({ ok: true, value: { status: 'confirmed', memberId: actorId } })

  const holder = await testDb.$client.getConnection()
  let billing: ReturnType<typeof lockMatch> | undefined
  let removal: ReturnType<typeof adminRemoveEntry> | undefined
  try {
    await holder.beginTransaction()
    await holder.execute('SELECT id FROM matches WHERE id = ? FOR UPDATE', [match.id])
    // Queue billing first, then removal. Both must reach the match row before release.
    billing = lockMatch(testDb, match.id, lockTime)
    void billing.catch(() => {})
    await waitForLockWait(`\`matches\`.\`id\` = ${match.id} for update`)
    removal = adminRemoveEntry(testDb, { actorId, entryId: target.id, now: lockTime, reason: 'test' })
    void removal.catch(() => {})
    await waitForLockWait(`\`matches\`.\`id\` = (select \`matchId\` from \`entries\` where \`entries\`.\`id\` = ${target.id})`)
    await holder.commit()

    const [locked, removed] = await Promise.allSettled([billing, removal])
    // Report the original MySQL cause if either transaction rejects, including a deadlock.
    if (locked.status === 'rejected') throw locked.reason
    if (removed.status === 'rejected') throw removed.reason
    expect(removed.value).toMatchObject({ ok: true, value: { id: target.id, status: 'removed' } })
    expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'locked' })
    const rows = await matchCharges(match.id)
    const targetCharge = rows.find(charge => charge.memberId === target.memberId)
    expect(locked.value).toEqual({ ok: true, value: { chargesCreated: targetCharge ? 4 : 3 } })
    expect(rows).toHaveLength(targetCharge ? 4 : 3)
    expect(rows.filter(charge => charge.status === 'charged').map(charge => charge.memberId))
      .toEqual([actorId, ...roster.slice(1).map(entry => entry.memberId)])
    if (targetCharge) {
      expect(targetCharge).toMatchObject({ status: 'waived', waivedBy: actorId, waiveReason: 'test' })
    }
  } finally {
    try {
      await holder.rollback()
    } finally {
      holder.release()
      await Promise.allSettled([billing, removal])
    }
  }
}, 10_000)

it.each([1, 2, 3, 4, 5])('serializes reciprocal admin additions on different matches (run %i)', async () => {
  const first = await createMatchForDate(testDb, '2027-03-30')
  const second = await createMatchForDate(testDb, '2027-04-06')
  const [a, b] = await testDb.insert(members)
    .values([{ name: 'Admin A', role: 'admin' }, { name: 'Admin B', role: 'admin' }]).$returningId()
  const holder = await testDb.$client.getConnection()
  let aAddsB: ReturnType<typeof adminAddEntry> | undefined
  let bAddsA: ReturnType<typeof adminAddEntry> | undefined
  try {
    await holder.beginTransaction()
    await holder.execute('SELECT id FROM members WHERE id = ? FOR UPDATE', [b.id])
    // B must take lower-ID A before waiting for higher-ID B. A's own add then waits for A.
    bAddsA = adminAddEntry(testDb, { actorId: b.id, matchId: second.id, memberId: a.id, now: guestOpen, reason: '' })
    void bAddsA.catch(() => {})
    await waitForLockWait(`from \`members\` where \`members\`.\`id\` = ${b.id} for update`)
    aAddsB = adminAddEntry(testDb, { actorId: a.id, matchId: first.id, memberId: b.id, now: guestOpen, reason: '' })
    void aAddsB.catch(() => {})
    await waitForLockWait(`from \`members\` where \`members\`.\`id\` = ${a.id} for update`)
    await holder.commit()

    const [addedB, addedA] = await Promise.allSettled([aAddsB, bAddsA])
    if (addedB.status === 'rejected') throw addedB.reason
    if (addedA.status === 'rejected') throw addedA.reason
    expect(addedB.value).toMatchObject({ ok: true, value: { matchId: first.id, memberId: b.id, status: 'confirmed' } })
    expect(addedA.value).toMatchObject({ ok: true, value: { matchId: second.id, memberId: a.id, status: 'confirmed' } })
  } finally {
    try {
      await holder.rollback()
    } finally {
      holder.release()
      await Promise.allSettled([aAddsB, bAddsA])
    }
  }
}, 10_000)

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
