import { and, asc, eq, inArray, sum } from 'drizzle-orm'
import type { Tx } from '@/db'
import { charges, paymentAllocations, payments } from '@/db/schema'

/**
 * Allocates available member credit across outstanding charged debts, oldest month first.
 *
 * NOTE: This function does not perform any row locking itself.
 * Callers MUST acquire the necessary locks (specifically member rows for the target member)
 * prior to calling this function to prevent concurrent allocation races.
 */
export async function allocateAvailableCredit(tx: Tx, memberId: string, createdAt: Date): Promise<number> {
  // 1. Read the member's payments ordered by paidAt, then id.
  const memberPayments = await tx.select()
    .from(payments)
    .where(eq(payments.memberId, memberId))
    .orderBy(asc(payments.paidAt), asc(payments.id))

  // Early return if the member has no payments.
  if (memberPayments.length === 0) return 0

  const paymentIds = memberPayments.map(p => p.id)

  // 2. Read allocations for those payments:
  // - grouped by payment (to get each payment's allocated total)
  // - grouped by billing month (to get each month's credited total)
  const [allocatedByPaymentRows, creditedByMonthRows] = await Promise.all([
    tx.select({
      paymentId: paymentAllocations.paymentId,
      total: sum(paymentAllocations.amountAgorot),
    })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.paymentId, paymentIds))
      .groupBy(paymentAllocations.paymentId),

    tx.select({
      billingMonth: paymentAllocations.billingMonth,
      total: sum(paymentAllocations.amountAgorot),
    })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.paymentId, paymentIds))
      .groupBy(paymentAllocations.billingMonth),
  ])

  const allocatedByPayment = new Map(
    allocatedByPaymentRows.map(r => [r.paymentId, Number(r.total ?? 0)]),
  )
  const creditedByMonth = new Map(
    creditedByMonthRows.map(r => [r.billingMonth, Number(r.total ?? 0)]),
  )

  // 3. Read the member's outstanding debt: charges with status = 'charged',
  // grouped by billingMonth, ordered ascending.
  const debts = await tx.select({
    billingMonth: charges.billingMonth,
    total: sum(charges.amountAgorot),
  })
    .from(charges)
    .where(and(eq(charges.memberId, memberId), eq(charges.status, 'charged')))
    .groupBy(charges.billingMonth)
    .orderBy(asc(charges.billingMonth))

  // outstanding month = charge total - allocations credited to that month
  const outstandingByMonth = new Map<string, number>()
  for (const debt of debts) {
    const chargeTotal = Number(debt.total ?? 0)
    const credited = creditedByMonth.get(debt.billingMonth) ?? 0
    const outstanding = chargeTotal - credited
    if (outstanding > 0) {
      outstandingByMonth.set(debt.billingMonth, outstanding)
    }
  }

  if (outstandingByMonth.size === 0) return 0

  // 4. For each payment in order, credit = payment.amountAgorot - allocatedTotal; if credit <= 0 skip.
  // Allocate min(credit, outstanding) into paymentAllocations for months with positive outstanding,
  // oldest month first, decrementing both the payment's remaining credit and the month's outstanding.
  let totalAllocated = 0

  for (const payment of memberPayments) {
    const allocatedTotal = allocatedByPayment.get(payment.id) ?? 0
    let credit = payment.amountAgorot - allocatedTotal
    if (credit <= 0) continue

    for (const [billingMonth, outstanding] of outstandingByMonth) {
      if (credit <= 0) break
      if (outstanding <= 0) continue

      const toAllocate = Math.min(credit, outstanding)
      if (toAllocate <= 0) continue

      await tx.insert(paymentAllocations).values({
        paymentId: payment.id,
        billingMonth,
        amountAgorot: toAllocate,
        createdAt,
      })

      credit -= toAllocate
      outstandingByMonth.set(billingMonth, outstanding - toAllocate)
      totalAllocated += toAllocate
    }
  }

  return totalAllocated
}
