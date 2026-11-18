import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { auditLog, charges, entries, guestPayments, matches, members, paymentAllocations, payments } from '@/db/schema'
import {
  cancelMatch, memberBalance, memberBill, monthSummary, recordGuestPayment, recordPayment, refundGuestPayment, setMonthlyExpense,
} from '@/domain/billing'
import { lockMatch } from '@/domain/lock'
import { createMatchForDate } from '@/domain/matches'
import type { Result } from '@/lib/result'
import { testDb, resetDb } from '../db'

const now = new Date('2027-03-30T11:00:00Z')
beforeEach(resetDb)

async function setupMember() {
  const [admin, member] = await testDb.insert(members)
    .values([{ name: 'Admin', role: 'admin' }, { name: 'Member' }]).$returningId()
  return { adminId: admin.id, memberId: member.id }
}

async function addCharge(memberId: number, month: string, amountAgorot: number, day = '12') {
  const match = await createMatchForDate(testDb, `${month}-${day}`)
  await testDb.insert(charges).values({ matchId: match.id, memberId, billingMonth: month, amountAgorot })
  return match
}

function valueOf<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.code)
  return result.value
}

function allocationsFor(paymentId: number) {
  return testDb.select({ billingMonth: paymentAllocations.billingMonth, amountAgorot: paymentAllocations.amountAgorot })
    .from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId)).orderBy(paymentAllocations.id)
}

it('allocates oldest debt first and splits across months', async () => {
  const { adminId, memberId } = await setupMember()
  await addCharge(memberId, '2027-01', 3500)
  await addCharge(memberId, '2027-02', 7000)

  const p = await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 5000, paidAt: now, method: 'paybox' })
  expect(p.ok).toBe(true)
  expect(await allocationsFor(valueOf(p).id)).toEqual([{ billingMonth: '2027-01', amountAgorot: 3500 }, { billingMonth: '2027-02', amountAgorot: 1500 }])
  expect((await memberBalance(testDb, memberId)).balanceAgorot).toBe(5500)
})

it('leaves an overpayment as credit and never allocates more than the debt', async () => {
  const { adminId, memberId } = await setupMember()
  await addCharge(memberId, '2027-02', 7000)
  await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 10000, paidAt: now, method: 'cash' })
  expect((await memberBalance(testDb, memberId)).balanceAgorot).toBe(-3000)
  expect((await monthSummary(testDb, '2027-02')).memberCollectedAgorot).toBe(7000)
})

it('honours a target month before older debt', async () => {
  const { adminId, memberId } = await setupMember()
  await addCharge(memberId, '2027-01', 3500)
  await addCharge(memberId, '2027-02', 3500)
  const p = await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 3500, paidAt: now, method: 'paybox', targetMonth: '2027-02' })
  expect(await allocationsFor(valueOf(p).id)).toEqual([{ billingMonth: '2027-02', amountAgorot: 3500 }])
})

it('returns a monthly bill with joined payments and due after this month’s allocations', async () => {
  const { adminId, memberId } = await setupMember()
  await addCharge(memberId, '2027-01', 3500)
  const februaryMatch = await addCharge(memberId, '2027-02', 7000)
  const payment = valueOf(await recordPayment(testDb, {
    actorId: adminId, memberId, amountAgorot: 5000, paidAt: now, method: 'paybox', note: 'split payment',
  }))
  expect(await memberBill(testDb, memberId, '2027-02')).toMatchObject({
    charges: [{
      billingMonth: '2027-02', amountAgorot: 7000, matchDate: '2027-02-12', kickoffAt: februaryMatch.kickoffAt,
    }],
    allocations: [{ billingMonth: '2027-02', amountAgorot: 1500, payment }],
    dueAgorot: 5500,
  })
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'payment.record')))
    .toMatchObject([{ actorId: adminId, entityId: String(payment.id), createdAt: now }])
})

it('caps negative allocations at collected amounts and visits the target before outstanding months', async () => {
  const { adminId, memberId } = await setupMember()
  await addCharge(memberId, '2027-01', 3500)
  await addCharge(memberId, '2027-02', 7000)
  const input = { actorId: adminId, memberId, paidAt: now, method: 'other' } as const
  await recordPayment(testDb, { ...input, amountAgorot: 5000 })
  await addCharge(memberId, '2027-01', 1000, '19')
  const reversal = valueOf(await recordPayment(testDb, { ...input, amountAgorot: -6000, targetMonth: '2027-02' }))
  expect(await allocationsFor(reversal.id)).toEqual([
    { billingMonth: '2027-02', amountAgorot: -1500 },
    { billingMonth: '2027-01', amountAgorot: -3500 },
  ])
  expect(await memberBalance(testDb, memberId)).toEqual({ chargesAgorot: 11500, paidAgorot: -1000, balanceAgorot: 12500 })
})

it('rejects unauthorized or invalid payments without ledger writes', async () => {
  const { adminId, memberId } = await setupMember()
  const input = { actorId: adminId, memberId, paidAt: now, method: 'cash', amountAgorot: 5000 } as const
  expect(await recordPayment(testDb, { ...input, actorId: memberId })).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await recordPayment(testDb, { ...input, memberId: 999 })).toEqual({ ok: false, code: 'MEMBER_NOT_FOUND' })
  expect(await recordPayment(testDb, { ...input, amountAgorot: 0 })).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await recordPayment(testDb, { ...input, amountAgorot: -5000 })).toEqual({ ok: false, code: 'TARGET_MONTH_REQUIRED' })
  expect(await testDb.select().from(payments)).toEqual([])
})

it('serializes allocations by different admins paying the same member', async () => {
  const { adminId, memberId } = await setupMember()
  const [second] = await testDb.insert(members).values({ name: 'Second admin', role: 'admin' }).$returningId()
  await addCharge(memberId, '2027-02', 7000)
  const input = { memberId, amountAgorot: 5000, paidAt: now, method: 'cash' } as const
  const results = await Promise.all([
    recordPayment(testDb, { ...input, actorId: adminId }),
    recordPayment(testDb, { ...input, actorId: second.id }),
  ])
  expect(results.map(result => valueOf(result).amountAgorot)).toEqual([5000, 5000])
  expect((await monthSummary(testDb, '2027-02')).memberCollectedAgorot).toBe(7000)
  expect((await memberBalance(testDb, memberId)).balanceAgorot).toBe(-3000)
})

async function setupGuest(date = '2027-03-30') {
  const people = await setupMember()
  const match = await createMatchForDate(testDb, date)
  const [guest] = await testDb.insert(entries).values({
    matchId: match.id, guestName: 'Guest', hostMemberId: people.memberId, kind: 'guest',
  }).$returningId()
  return { ...people, match, entryId: guest.id }
}

it('includes a guest payment in the match’s Jerusalem kickoff month, not the payment month', async () => {
  const { adminId, match, entryId } = await setupGuest('2027-03-01')
  await testDb.update(matches).set({ kickoffAt: new Date('2027-02-28T22:00:00Z') }).where(eq(matches.id, match.id))
  const paidAt = new Date('2027-04-01T00:00:00Z')
  const guestPayment = valueOf(await recordGuestPayment(testDb, { actorId: adminId, entryId, amountAgorot: 3500, paidAt }))
  expect((await monthSummary(testDb, '2027-03')).guestCollectedAgorot).toBe(3500)
  expect((await monthSummary(testDb, '2027-02')).guestCollectedAgorot).toBe(0)
  expect((await monthSummary(testDb, '2027-04')).guestCollectedAgorot).toBe(0)
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'guest_payment.record')))
    .toMatchObject([{ entityId: String(guestPayment.id), createdAt: paidAt }])
})

it('records one negative refund and rejects refunding it or its original again', async () => {
  const { adminId, entryId } = await setupGuest()
  const payment = valueOf(await recordGuestPayment(testDb, { actorId: adminId, entryId, amountAgorot: 3500, paidAt: now }))
  const refundAt = new Date('2027-04-02T00:00:00Z')
  const input = { actorId: adminId, guestPaymentId: payment.id, now: refundAt, note: 'returned' }
  const refund = valueOf(await refundGuestPayment(testDb, input))
  expect(refund).toMatchObject({
    entryId, kind: 'refund', amountAgorot: -3500, refundOfId: payment.id, paidAt: refundAt, recordedBy: adminId, note: 'returned',
  })
  expect((await monthSummary(testDb, '2027-03')).guestCollectedAgorot).toBe(0)
  expect(await refundGuestPayment(testDb, input)).toEqual({ ok: false, code: 'ALREADY_REFUNDED' })
  expect(await refundGuestPayment(testDb, { ...input, guestPaymentId: refund.id })).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'guest_payment.refund')))
    .toMatchObject([{ entityId: String(refund.id), createdAt: refundAt }])
})

it('rejects invalid guest payments', async () => {
  const { adminId, memberId, match, entryId } = await setupGuest()
  const [memberEntry] = await testDb.insert(entries).values({ matchId: match.id, memberId, kind: 'member' }).$returningId()
  const input = { actorId: adminId, entryId, amountAgorot: 3500, paidAt: now }
  expect(await recordGuestPayment(testDb, { ...input, actorId: memberId })).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await recordGuestPayment(testDb, { ...input, entryId: 999 })).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await recordGuestPayment(testDb, { ...input, entryId: memberEntry.id })).toEqual({ ok: false, code: 'NOT_GUEST' })
  expect(await recordGuestPayment(testDb, { ...input, amountAgorot: 0 })).toEqual({ ok: false, code: 'INVALID_AMOUNT' })

  const [paidGuest] = await testDb.insert(entries).values({
    matchId: match.id, kind: 'guest', guestName: 'Paid guest', hostMemberId: memberId,
  }).$returningId()
  valueOf(await recordGuestPayment(testDb, { ...input, entryId: paidGuest.id }))
  const before = await monthSummary(testDb, '2027-03')
  expect(before.guestCollectedAgorot).toBe(3500)

  const rejected = await recordGuestPayment(testDb, { ...input, amountAgorot: -3500 })
  expect(rejected).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await testDb.select().from(guestPayments).where(eq(guestPayments.entryId, entryId))).toEqual([])
  expect(await monthSummary(testDb, '2027-03')).toEqual(before)
})

it('calculates the monthly pot separately from member debt and upserts field rent', async () => {
  const { adminId, memberId, entryId } = await setupGuest()
  const month = '2027-03'
  await addCharge(memberId, month, 7000)
  await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 5000, paidAt: now, method: 'paybox' })
  await recordGuestPayment(testDb, { actorId: adminId, entryId, amountAgorot: 3500, paidAt: now })
  const input = { actorId: adminId, month, fieldCostAgorot: 20000 }
  const initial = valueOf(await setMonthlyExpense(testDb, { ...input, fieldCostAgorot: 18000 }))
  expect(valueOf(await setMonthlyExpense(testDb, input))).toMatchObject({
    id: initial.id, billingMonth: month, fieldCostAgorot: 20000, updatedBy: adminId,
  })
  expect(await monthSummary(testDb, month)).toEqual({
    chargesAgorot: 7000, memberCollectedAgorot: 5000, guestCollectedAgorot: 3500, expenseAgorot: 20000,
    collectedAgorot: 8500, differenceAgorot: -11500, outstandingAgorot: 2000,
  })
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'expense.set')))
    .toMatchObject([{ entityId: month }, { entityId: month }])
})

it('rejects invalid or unauthorized expense updates', async () => {
  const { adminId, memberId } = await setupMember()
  const input = { actorId: adminId, month: '2027-03', fieldCostAgorot: 20000 }
  expect(await setMonthlyExpense(testDb, { ...input, actorId: memberId })).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await setMonthlyExpense(testDb, { ...input, month: '2027-13' })).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await setMonthlyExpense(testDb, { ...input, fieldCostAgorot: -1 })).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect((await monthSummary(testDb, input.month)).expenseAgorot).toBe(0)
})

it('excludes waived amounts from balance, bill due, and the pot’s charge total', async () => {
  const { memberId } = await setupMember()
  const month = '2027-03'
  await addCharge(memberId, month, 3500)
  await testDb.update(charges).set({ status: 'waived' }).where(eq(charges.memberId, memberId))
  await addCharge(memberId, month, 7000, '19')
  expect(await memberBalance(testDb, memberId)).toEqual({ chargesAgorot: 7000, paidAgorot: 0, balanceAgorot: 7000 })
  expect(await memberBill(testDb, memberId, month)).toMatchObject({ dueAgorot: 7000 })
  expect(await monthSummary(testDb, month)).toMatchObject({ chargesAgorot: 7000, outstandingAgorot: 7000 })
})

it('removes confirmed entries and expires the queue on scheduled cancellation without creating charges', async () => {
  const { adminId, memberId, match } = await setupGuest()
  const [other] = await testDb.insert(members).values({ name: 'Other' }).$returningId()
  await testDb.insert(entries).values([
    { matchId: match.id, memberId, kind: 'member', status: 'confirmed' },
    { matchId: match.id, memberId: adminId, kind: 'member', status: 'offered' },
    { matchId: match.id, memberId: other.id, kind: 'member', status: 'queued' },
  ])
  expect(await cancelMatch(testDb, { actorId: adminId, matchId: match.id, now, reason: 'match cancelled' }))
    .toMatchObject({ ok: true, value: { status: 'cancelled' } })
  expect((await testDb.select().from(entries).orderBy(entries.id)).map(row => row.status))
    .toEqual(['removed', 'removed', 'expired', 'expired'])
  expect(await lockMatch(testDb, match.id, now)).toEqual({ ok: true, value: { chargesCreated: 0 } })
  expect(await testDb.select().from(charges)).toEqual([])
})

it('waives charges and reverses guest money without replacing the original payment on post-lock cancellation', async () => {
  const { adminId, memberId, match, entryId } = await setupGuest()
  await testDb.insert(entries).values([
    { matchId: match.id, memberId, kind: 'member' },
    { matchId: match.id, memberId: adminId, kind: 'member' },
  ])
  expect(await lockMatch(testDb, match.id, now)).toEqual({ ok: true, value: { chargesCreated: 2 } })
  const payment = valueOf(await recordGuestPayment(testDb, { actorId: adminId, entryId, amountAgorot: 3500, paidAt: now }))
  const input = { actorId: adminId, matchId: match.id, now, reason: '  match cancelled  ' }
  expect(await cancelMatch(testDb, input)).toMatchObject({ ok: true, value: { status: 'cancelled' } })
  expect(await cancelMatch(testDb, input)).toEqual({ ok: false, code: 'ALREADY_CANCELLED' })
  const waiver = { status: 'waived', waivedBy: adminId, waiveReason: 'match cancelled', updatedAt: now }
  expect(await testDb.select().from(charges)).toMatchObject([waiver, waiver])
  const [original, refund, ...extra] = await testDb.select().from(guestPayments).orderBy(guestPayments.id)
  expect(original).toEqual(payment)
  expect(refund).toMatchObject({ kind: 'refund', refundOfId: payment.id, amountAgorot: -3500, paidAt: now })
  expect(extra).toEqual([])
  expect(await monthSummary(testDb, '2027-03')).toMatchObject({ guestCollectedAgorot: 0, chargesAgorot: 0 })
  expect((await memberBalance(testDb, memberId)).balanceAgorot).toBe(0)
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'match.cancel')))
    .toMatchObject([{ actorId: adminId, entityId: String(match.id), detail: { reason: 'match cancelled' }, createdAt: now }])
})

it('does not duplicate a manual guest refund racing cancellation of a played match', async () => {
  const { adminId, match, entryId } = await setupGuest()
  const [second] = await testDb.insert(members).values({ name: 'Second admin', role: 'admin' }).$returningId()
  await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, match.id))
  const payment = valueOf(await recordGuestPayment(testDb, { actorId: adminId, entryId, amountAgorot: 3500, paidAt: now }))
  const [cancelled, manualRefund] = await Promise.all([
    cancelMatch(testDb, { actorId: adminId, matchId: match.id, now, reason: 'match cancelled' }),
    refundGuestPayment(testDb, { actorId: second.id, guestPaymentId: payment.id, now }),
  ])
  expect(cancelled).toMatchObject({ ok: true, value: { status: 'cancelled' } })
  if (!manualRefund.ok) expect(manualRefund.code).toBe('ALREADY_REFUNDED')
  expect(await testDb.select().from(guestPayments).where(eq(guestPayments.refundOfId, payment.id)))
    .toMatchObject([{ kind: 'refund', amountAgorot: -3500 }])
})

it('rejects cancellation by a non-admin, without a valid reason, or for a missing match', async () => {
  const { adminId, memberId, match } = await setupGuest()
  const input = { actorId: adminId, matchId: match.id, now, reason: 'match cancelled' }
  expect(await cancelMatch(testDb, { ...input, actorId: memberId })).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await cancelMatch(testDb, { ...input, reason: '  ' })).toEqual({ ok: false, code: 'INVALID_REASON' })
  expect(await cancelMatch(testDb, { ...input, reason: 'x'.repeat(256) })).toEqual({ ok: false, code: 'INVALID_REASON' })
  expect(await cancelMatch(testDb, { ...input, matchId: 999 })).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await testDb.select().from(matches)).toMatchObject([{ status: 'scheduled' }])
})
