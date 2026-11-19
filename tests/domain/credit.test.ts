import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { charges, entries, paymentAllocations, members } from '@/db/schema'
import { memberBalance, memberBill, monthSummary, recordPayment } from '@/domain/billing'
import { lockMatch, restoreCharge, waiveCharge } from '@/domain/lock'
import { createMatchForDate } from '@/domain/matches'
import type { Result } from '@/lib/result'
import { testDb, resetDb } from '../db'

beforeEach(resetDb)

function valueOf<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.code)
  return result.value
}

async function setupMember() {
  const [admin, member] = await testDb.insert(members)
    .values([{ name: 'Admin', role: 'admin' }, { name: 'Member' }]).$returningId()
  return { adminId: admin.id, memberId: member.id }
}

async function createAndLockMatch(date: string, memberId: number) {
  const match = await createMatchForDate(testDb, date)
  await testDb.insert(entries).values({
    matchId: match.id,
    memberId,
    kind: 'member',
    status: 'confirmed',
  })
  const lockResult = await lockMatch(testDb, match.id, match.lockAt)
  expect(lockResult).toMatchObject({ ok: true, value: { transitioned: true } })
  return match
}

it('allocates advance credit when a later match locks, and continues to subsequent months', async () => {
  const { adminId, memberId } = await setupMember()
  const payAt = new Date('2027-02-01T10:00:00Z')

  // Pay 7000 with no charges -> no allocation rows
  const payment = valueOf(await recordPayment(testDb, {
    actorId: adminId,
    memberId,
    amountAgorot: 7000,
    paidAt: payAt,
    method: 'paybox',
  }))
  const initialAllocations = await testDb.select().from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, payment.id))
  expect(initialAllocations).toEqual([])

  // Then lock a match charging that member 3500 -> exactly one allocation of 3500 for the match's billing month
  await createAndLockMatch('2027-03-10', memberId)
  const marchAllocations = await testDb.select().from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, payment.id))
  expect(marchAllocations).toMatchObject([
    { paymentId: payment.id, billingMonth: '2027-03', amountAgorot: 3500 },
  ])
  expect(marchAllocations.length).toBe(1)

  // monthSummary for that month reports memberCollectedAgorot: 3500, outstandingAgorot: 0
  const marchSummary = await monthSummary(testDb, '2027-03')
  expect(marchSummary.memberCollectedAgorot).toBe(3500)
  expect(marchSummary.outstandingAgorot).toBe(0)

  // memberBill(...).dueAgorot is 0
  const marchBill = await memberBill(testDb, memberId, '2027-03')
  expect(marchBill.dueAgorot).toBe(0)

  // memberBalance still shows the remaining 3500 credit (balanceAgorot: -3500)
  const balanceAfterFirst = await memberBalance(testDb, memberId)
  expect(balanceAfterFirst.balanceAgorot).toBe(-3500)

  // Then lock a second match in the next month -> the remaining 3500 is allocated to that month
  await createAndLockMatch('2027-04-14', memberId)
  const allAllocations = await testDb.select().from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, payment.id))
    .orderBy(paymentAllocations.id)
  expect(allAllocations).toMatchObject([
    { paymentId: payment.id, billingMonth: '2027-03', amountAgorot: 3500 },
    { paymentId: payment.id, billingMonth: '2027-04', amountAgorot: 3500 },
  ])

  // Total allocations equal 7000 and never exceed the payment
  const totalAllocated = allAllocations.reduce((sum, a) => sum + a.amountAgorot, 0)
  expect(totalAllocated).toBe(7000)
  expect(totalAllocated).toBeLessThanOrEqual(payment.amountAgorot)

  const aprilBill = await memberBill(testDb, memberId, '2027-04')
  expect(aprilBill.dueAgorot).toBe(0)
  const balanceAfterSecond = await memberBalance(testDb, memberId)
  expect(balanceAfterSecond.balanceAgorot).toBe(0)
})

it('allocates the earlier payment first when two advance payments exist', async () => {
  const { adminId, memberId } = await setupMember()
  const p1 = valueOf(await recordPayment(testDb, {
    actorId: adminId,
    memberId,
    amountAgorot: 2000,
    paidAt: new Date('2027-01-01T10:00:00Z'),
    method: 'cash',
  }))
  const p2 = valueOf(await recordPayment(testDb, {
    actorId: adminId,
    memberId,
    amountAgorot: 5000,
    paidAt: new Date('2027-01-02T10:00:00Z'),
    method: 'paybox',
  }))

  // Single 3500 charge -> the earlier payment is allocated first
  await createAndLockMatch('2027-03-10', memberId)
  const p1Allocations = await testDb.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, p1.id))
  const p2Allocations = await testDb.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, p2.id))

  expect(p1Allocations).toMatchObject([
    { paymentId: p1.id, billingMonth: '2027-03', amountAgorot: 2000 },
  ])
  expect(p2Allocations).toMatchObject([
    { paymentId: p2.id, billingMonth: '2027-03', amountAgorot: 1500 },
  ])

  const bill = await memberBill(testDb, memberId, '2027-03')
  expect(bill.dueAgorot).toBe(0)
})

it('covers a restored charge with existing credit', async () => {
  const { adminId, memberId } = await setupMember()
  // Member has paid in advance
  const payment = valueOf(await recordPayment(testDb, {
    actorId: adminId,
    memberId,
    amountAgorot: 5000,
    paidAt: new Date('2027-01-01T10:00:00Z'),
    method: 'cash',
  }))

  const match = await createAndLockMatch('2027-03-10', memberId)
  const [charge] = await testDb.select().from(charges)
    .where(eq(charges.matchId, match.id))

  // Waive the charge
  const waived = valueOf(await waiveCharge(testDb, { actorId: adminId, chargeId: charge.id, reason: 'injury' }))
  expect(waived.status).toBe('waived')

  // When waived, member bill due is 0 and payment allocation might still be there or removed;
  // Now restore the charge -> restored charge is covered by credit (allocation appears, dueAgorot 0)
  const restored = valueOf(await restoreCharge(testDb, { actorId: adminId, chargeId: charge.id }))
  expect(restored.status).toBe('charged')

  const bill = await memberBill(testDb, memberId, '2027-03')
  expect(bill.dueAgorot).toBe(0)
  const allocations = await testDb.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id))
  const allocatedSum = allocations.reduce((sum, a) => sum + a.amountAgorot, 0)
  expect(allocatedSum).toBe(3500)
})

it('leaves a member with no payments unaffected', async () => {
  const { memberId } = await setupMember()
  const match = await createAndLockMatch('2027-03-10', memberId)

  const createdCharges = await testDb.select().from(charges).where(eq(charges.matchId, match.id))
  expect(createdCharges.length).toBe(1)
  expect(createdCharges[0].amountAgorot).toBe(3500)

  const allocations = await testDb.select().from(paymentAllocations)
  expect(allocations).toEqual([])

  const bill = await memberBill(testDb, memberId, '2027-03')
  expect(bill.dueAgorot).toBe(3500)
})

it('allocates credit when an admin manually adds a member to a locked match', async () => {
  const { adminId, memberId } = await setupMember()
  const payment = valueOf(await recordPayment(testDb, {
    actorId: adminId,
    memberId,
    amountAgorot: 5000,
    paidAt: new Date('2027-01-01T10:00:00Z'),
    method: 'cash',
  }))

  const match = await createMatchForDate(testDb, '2027-03-10')
  // Lock match with no roster
  await lockMatch(testDb, match.id, match.lockAt)

  // Admin adds member to locked match
  const { adminAddEntry } = await import('@/domain/lock')
  const entryResult = await adminAddEntry(testDb, {
    actorId: adminId,
    matchId: match.id,
    memberId,
    now: match.lockAt,
    reason: 'late addition',
  })
  expect(entryResult.ok).toBe(true)

  // Member should be charged 3500 and credit should cover it
  const bill = await memberBill(testDb, memberId, '2027-03')
  expect(bill.dueAgorot).toBe(0)

  const allocations = await testDb.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id))
  expect(allocations).toMatchObject([
    { paymentId: payment.id, billingMonth: '2027-03', amountAgorot: 3500 },
  ])
})
