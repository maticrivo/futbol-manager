import { and, eq, inArray, sum } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import type { Db, Executor, Tx } from '@/db'
import { charges, entries, expenses, guestPayments, matches, members, paymentAllocations, payments } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { billingMonthOf } from '@/lib/time'
import { writeAudit } from './audit'
import { isValidReason, lockAdminActor, type Charge } from './charges'
import { lockMatch } from './entries'
import type { Match } from './matches'

export type Payment = typeof payments.$inferSelect
export type GuestPayment = typeof guestPayments.$inferSelect
export type Expense = typeof expenses.$inferSelect

type BillAllocation = {
  billingMonth: string
  amountAgorot: number
  payment: Payment
}

function chargedTotal(db: Executor, memberId?: number, month?: string) {
  return db.select({ total: sum(charges.amountAgorot) }).from(charges).where(and(
    eq(charges.status, 'charged'),
    memberId === undefined ? undefined : eq(charges.memberId, memberId),
    month === undefined ? undefined : eq(charges.billingMonth, month),
  ))
}

export async function memberBalance(db: Db, memberId: number): Promise<{
  chargesAgorot: number; paidAgorot: number; balanceAgorot: number
}> {
  return db.transaction(async tx => {
    const [charged] = await chargedTotal(tx, memberId)
    const [paid] = await tx.select({ total: sum(payments.amountAgorot) })
      .from(payments).where(eq(payments.memberId, memberId))
    const chargesAgorot = Number(charged.total ?? 0)
    const paidAgorot = Number(paid.total ?? 0)
    return { chargesAgorot, paidAgorot, balanceAgorot: chargesAgorot - paidAgorot }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export type BillCharge = Charge & { matchDate: string; kickoffAt: Date }

export async function memberBill(db: Db, memberId: number, month: string): Promise<{
  charges: BillCharge[]; allocations: BillAllocation[]; dueAgorot: number
}> {
  return db.transaction(async tx => {
    const rows = await tx.select({ charge: charges, matchDate: matches.matchDate, kickoffAt: matches.kickoffAt })
      .from(charges).innerJoin(matches, eq(matches.id, charges.matchId))
      .where(and(eq(charges.memberId, memberId), eq(charges.billingMonth, month))).orderBy(charges.id)
    const billCharges = rows.map(({ charge, matchDate, kickoffAt }) => ({ ...charge, matchDate, kickoffAt }))
    const allocations = await tx.select({
      billingMonth: paymentAllocations.billingMonth, amountAgorot: paymentAllocations.amountAgorot, payment: payments,
    }).from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(and(eq(payments.memberId, memberId), eq(paymentAllocations.billingMonth, month)))
      .orderBy(paymentAllocations.id)
    const dueAgorot = billCharges.reduce((total, charge) => total + (charge.status === 'charged' ? charge.amountAgorot : 0), 0)
      - allocations.reduce((total, allocation) => total + allocation.amountAgorot, 0)
    return { charges: billCharges, allocations, dueAgorot }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

type PaymentInput = {
  actorId: number
  memberId: number
  amountAgorot: number
  paidAt: Date
  method: Payment['method']
  note?: string
  targetMonth?: string
}

const isMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
const isSignedAmount = (amount: number) => Number.isInteger(amount) && amount >= -2147483648 && amount <= 2147483647

export async function recordPayment(
  db: Db,
  { actorId, memberId, amountAgorot, paidAt, method, note, targetMonth }: PaymentInput,
): Promise<Result<Payment, 'FORBIDDEN' | 'MEMBER_NOT_FOUND' | 'INVALID_AMOUNT' | 'TARGET_MONTH_REQUIRED'>> {
  return db.transaction(async tx => {
    const ids = [...new Set([actorId, memberId])].sort((a, b) => a - b)
    const locked = await tx.select({ id: members.id, role: members.role }).from(members)
      .where(inArray(members.id, ids)).orderBy(members.id).for('update')
    if (locked.find(member => member.id === actorId)?.role !== 'admin') return err('FORBIDDEN')
    if (!locked.some(member => member.id === memberId)) return err('MEMBER_NOT_FOUND')
    if (!isSignedAmount(amountAgorot) || amountAgorot === 0) return err('INVALID_AMOUNT')
    if (amountAgorot < 0 && !targetMonth) return err('TARGET_MONTH_REQUIRED')

    const row = { memberId, amountAgorot, paidAt, method, note: note ?? null, recordedBy: actorId, createdAt: paidAt }
    const [{ id }] = await tx.insert(payments).values(row).$returningId()
    const debts = await tx.select({ month: charges.billingMonth, total: sum(charges.amountAgorot) })
      .from(charges).where(and(eq(charges.memberId, memberId), eq(charges.status, 'charged')))
      .groupBy(charges.billingMonth).orderBy(charges.billingMonth)
    const allocations = await tx.select({ month: paymentAllocations.billingMonth, total: sum(paymentAllocations.amountAgorot) })
      .from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(eq(payments.memberId, memberId)).groupBy(paymentAllocations.billingMonth)
    const collected = new Map(allocations.map(({ month, total }) => [month, Number(total ?? 0)]))
    const outstanding = new Map(debts.map(({ month, total }) => [month, Number(total ?? 0) - (collected.get(month) ?? 0)]))
    const months = new Set<string>()
    if (targetMonth) months.add(targetMonth)
    for (const [month, debt] of outstanding) {
      if (debt > 0) months.add(month)
    }

    let remaining = Math.abs(amountAgorot)
    for (const billingMonth of months) {
      if (remaining === 0) break
      const capacity = (amountAgorot > 0 ? outstanding : collected).get(billingMonth) ?? 0
      if (capacity <= 0) continue
      const allocated = Math.min(remaining, capacity)
      await tx.insert(paymentAllocations).values({
        paymentId: id, billingMonth, amountAgorot: Math.sign(amountAgorot) * allocated, createdAt: paidAt,
      })
      remaining -= allocated
    }

    await writeAudit(tx, { actorId, action: 'payment.record', entity: 'payment', entityId: String(id), createdAt: paidAt })
    return ok({ id, ...row })
  })
}

export async function monthSummary(db: Db, month: string): Promise<{
  chargesAgorot: number; memberCollectedAgorot: number; guestCollectedAgorot: number; expenseAgorot: number;
  collectedAgorot: number; differenceAgorot: number; outstandingAgorot: number
}> {
  return db.transaction(async tx => {
    const [charged] = await chargedTotal(tx, undefined, month)
    const [allocated] = await tx.select({ total: sum(paymentAllocations.amountAgorot) })
      .from(paymentAllocations).where(eq(paymentAllocations.billingMonth, month))
    const guestMoney = await tx.select({ amount: sum(guestPayments.amountAgorot), kickoffAt: matches.kickoffAt })
      .from(guestPayments).innerJoin(entries, eq(entries.id, guestPayments.entryId))
      .innerJoin(matches, eq(matches.id, entries.matchId)).groupBy(matches.kickoffAt)
    const [expense] = await tx.select({ amount: expenses.fieldCostAgorot }).from(expenses)
      .where(eq(expenses.billingMonth, month))

    const chargesAgorot = Number(charged.total ?? 0)
    const memberCollectedAgorot = Number(allocated.total ?? 0)
    const guestCollectedAgorot = guestMoney.reduce((total, row) =>
      billingMonthOf(row.kickoffAt) === month ? total + Number(row.amount ?? 0) : total, 0)
    const expenseAgorot = expense?.amount ?? 0
    const collectedAgorot = memberCollectedAgorot + guestCollectedAgorot
    return {
      chargesAgorot, memberCollectedAgorot, guestCollectedAgorot, expenseAgorot, collectedAgorot,
      differenceAgorot: collectedAgorot - expenseAgorot, outstandingAgorot: chargesAgorot - memberCollectedAgorot,
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

type GuestPaymentInput = { actorId: number; entryId: number; amountAgorot: number; paidAt: Date; note?: string }
type RefundInput = { actorId: number; guestPaymentId: number; now: Date; note?: string }
type RefundError = 'NOT_FOUND' | 'ALREADY_REFUNDED' | 'INVALID_AMOUNT'

async function insertGuestMoney(tx: Tx, row: Omit<GuestPayment, 'id'>): Promise<GuestPayment> {
  const [{ id }] = await tx.insert(guestPayments).values(row).$returningId()
  return { id, ...row }
}

export async function recordGuestPayment(
  db: Db,
  { actorId, entryId, amountAgorot, paidAt, note }: GuestPaymentInput,
): Promise<Result<GuestPayment, 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_AMOUNT' | 'NOT_GUEST' | 'MATCH_FINISHED'>> {
  return db.transaction(async tx => {
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    const [entry] = await tx.select({ kind: entries.kind, matchId: entries.matchId })
      .from(entries).where(eq(entries.id, entryId)).for('update')
    if (!entry) return err('NOT_FOUND')
    if (entry.kind !== 'guest') return err('NOT_GUEST')
    const [parent] = await tx.select({ status: matches.status }).from(matches).where(eq(matches.id, entry.matchId))
    if (parent?.status === 'cancelled') return err('MATCH_FINISHED')
    // Only a linked refund may subtract from the guest ledger.
    if (amountAgorot <= 0 || !isSignedAmount(amountAgorot)) return err('INVALID_AMOUNT')
    const payment = await insertGuestMoney(tx, {
      entryId, amountAgorot, paidAt, note: note ?? null, kind: 'payment',
      refundOfId: null, recordedBy: actorId, createdAt: paidAt,
    })
    await writeAudit(tx, {
      actorId, action: 'guest_payment.record', entity: 'guest_payment', entityId: String(payment.id), createdAt: paidAt,
    })
    return ok(payment)
  })
}

// Both refund paths hold the guest entry lock and use READ COMMITTED to see any prior refund.
async function insertGuestRefund(
  tx: Tx, original: GuestPayment, { actorId, now, note }: Omit<RefundInput, 'guestPaymentId'>,
): Promise<Result<GuestPayment, Exclude<RefundError, 'NOT_FOUND'>>> {
  const [existing] = await tx.select({ id: guestPayments.id }).from(guestPayments)
    .where(eq(guestPayments.refundOfId, original.id)).limit(1)
  if (existing) return err('ALREADY_REFUNDED')
  const amountAgorot = -original.amountAgorot
  if (amountAgorot === 0 || !isSignedAmount(amountAgorot)) return err('INVALID_AMOUNT')
  const refund = await insertGuestMoney(tx, {
    entryId: original.entryId, amountAgorot, paidAt: now, note: note ?? null, kind: 'refund',
    refundOfId: original.id, recordedBy: actorId, createdAt: now,
  })
  await writeAudit(tx, {
    actorId, action: 'guest_payment.refund', entity: 'guest_payment', entityId: String(refund.id), createdAt: now,
  })
  return ok(refund)
}

export async function refundGuestPayment(
  db: Db, input: RefundInput,
): Promise<Result<GuestPayment, 'FORBIDDEN' | RefundError | 'MATCH_FINISHED'>> {
  return db.transaction(async tx => {
    if (!await lockAdminActor(tx, input.actorId)) return err('FORBIDDEN')
    const [original] = await tx.select().from(guestPayments).where(eq(guestPayments.id, input.guestPaymentId))
    if (!original || original.kind !== 'payment') return err('NOT_FOUND')
    const [entry] = await tx.select({ id: entries.id, matchId: entries.matchId })
      .from(entries).where(eq(entries.id, original.entryId)).for('update')
    if (!entry) return err('NOT_FOUND')
    const [parent] = await tx.select({ status: matches.status }).from(matches).where(eq(matches.id, entry.matchId))
    if (parent?.status === 'cancelled') return err('MATCH_FINISHED')
    return insertGuestRefund(tx, original, input)
  }, { isolationLevel: 'read committed' })
}

export type MatchGuestPayment = GuestPayment & {
  guestName: string | null
  hostMemberId: number | null
  hostName: string | null
}

export async function listGuestPayments(db: Db, matchId: number): Promise<MatchGuestPayment[]> {
  const hosts = alias(members, 'hosts')
  const rows = await db.select({
    payment: guestPayments,
    guestName: entries.guestName,
    hostMemberId: entries.hostMemberId,
    hostName: hosts.name,
  }).from(guestPayments)
    .innerJoin(entries, eq(entries.id, guestPayments.entryId))
    .leftJoin(hosts, eq(hosts.id, entries.hostMemberId))
    .where(eq(entries.matchId, matchId))
    .orderBy(guestPayments.paidAt, guestPayments.id)
  return rows.map(({ payment, guestName, hostMemberId, hostName }) => ({ ...payment, guestName, hostMemberId, hostName }))
}

export async function cancelMatch(
  db: Db, input: { actorId: number; matchId: number; now: Date; reason: string },
): Promise<Result<Match, 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_CANCELLED' | 'MATCH_FINISHED' | 'INVALID_REASON'>> {
  const { actorId, matchId, now } = input
  return db.transaction(async tx => {
    const match = await lockMatch(tx, matchId)
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    const reason = input.reason.trim()
    if (!isValidReason(reason)) return err('INVALID_REASON')
    if (!match) return err('NOT_FOUND')
    if (match.status === 'played') return err('MATCH_FINISHED')
    if (match.status === 'cancelled') return err('ALREADY_CANCELLED')

    const update = { status: 'cancelled', updatedAt: now } as const
    await tx.update(matches).set(update).where(eq(matches.id, matchId))
    const matchEntries = eq(entries.matchId, matchId)
    await tx.update(entries).set({ status: 'expired', updatedAt: now })
      .where(and(matchEntries, inArray(entries.status, ['queued', 'offered'])))

    if (match.status === 'scheduled') {
      await tx.update(entries).set({ status: 'removed', updatedAt: now }).where(and(matchEntries, eq(entries.status, 'confirmed')))
    } else {
      await tx.update(charges).set({ status: 'waived', waivedBy: actorId, waiveReason: reason, updatedAt: now })
        .where(and(eq(charges.matchId, matchId), eq(charges.status, 'charged')))
    }

    // Serialize the ledger read and reversals with guest records/refunds from other admins.
    const guests = await tx.select({ id: entries.id }).from(entries)
      .where(and(matchEntries, eq(entries.kind, 'guest'))).orderBy(entries.id).for('update')
    if (guests.length > 0) {
      const originals = await tx.select().from(guestPayments).where(and(
        eq(guestPayments.kind, 'payment'), inArray(guestPayments.entryId, guests.map(guest => guest.id)),
      ))
      for (const original of originals) {
        const result = await insertGuestRefund(tx, original, { actorId, now, note: reason })
        if (!result.ok && result.code !== 'ALREADY_REFUNDED') {
          throw new Error(`Cannot reverse guest payment ${original.id}: ${result.code}`)
        }
      }
    }

    await writeAudit(tx, {
      actorId, action: 'match.cancel', entity: 'match', entityId: String(matchId), detail: { reason }, createdAt: now,
    })
    return ok({ ...match, ...update })
  }, { isolationLevel: 'read committed' })
}

export async function setMonthlyExpense(
  db: Db, { actorId, month, fieldCostAgorot }: { actorId: number; month: string; fieldCostAgorot: number },
): Promise<Result<Expense, 'FORBIDDEN' | 'INVALID_AMOUNT'>> {
  return db.transaction(async tx => {
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    if (!isMonth(month) || !Number.isInteger(fieldCostAgorot) || fieldCostAgorot < 0 || fieldCostAgorot > 2147483647)
      return err('INVALID_AMOUNT')
    const values = { fieldCostAgorot, updatedBy: actorId }
    await tx.insert(expenses).values({ billingMonth: month, ...values }).onDuplicateKeyUpdate({ set: values })
    const [expense] = await tx.select().from(expenses).where(eq(expenses.billingMonth, month))
    await writeAudit(tx, { actorId, action: 'expense.set', entity: 'expense', entityId: month, detail: { fieldCostAgorot } })
    return ok(expense)
  })
}
