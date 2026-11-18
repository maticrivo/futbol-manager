import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db'
import { charges, matches, members } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { billingMonthOf } from '@/lib/time'
import { writeAudit } from './audit'
import type { Match } from './matches'

export type Charge = typeof charges.$inferSelect

export async function isAdmin(db: Db, actorId: number): Promise<boolean> {
  const [actor] = await db.select({ role: members.role }).from(members).where(eq(members.id, actorId))
  return actor?.role === 'admin'
}

const charged = { status: 'charged', waivedBy: null, waiveReason: null } as const

function waiver(actorId: number, reason: string) {
  return { status: 'waived', waivedBy: actorId, waiveReason: reason } as const
}

function newCharge(match: Match, memberId: number, now: Date) {
  return {
    matchId: match.id, memberId, ...charged,
    amountAgorot: match.costAgorot, billingMonth: billingMonthOf(match.kickoffAt),
    createdAt: now, updatedAt: now,
  }
}

// Internal charge mutations run with the caller's match row lock held.
export async function createMatchCharges(tx: Tx, match: Match, memberIds: number[], now: Date): Promise<number> {
  if (memberIds.length === 0) return 0
  const [result] = await tx.insert(charges).values(memberIds.map(id => newCharge(match, id, now)))
  return result.affectedRows
}

export async function chargeAddedMember(tx: Tx, match: Match, memberId: number, now: Date): Promise<void> {
  // A member re-added after removal already has a charge; bill them again on that same row.
  await tx.insert(charges).values(newCharge(match, memberId, now))
    .onDuplicateKeyUpdate({ set: { ...charged, updatedAt: now } })
}

export async function waiveRemovedMember(
  tx: Tx, matchId: number, memberId: number, actorId: number, reason: string, now: Date,
): Promise<void> {
  await tx.update(charges).set({ ...waiver(actorId, reason), updatedAt: now })
    .where(and(eq(charges.matchId, matchId), eq(charges.memberId, memberId)))
}

async function lockCharge(tx: Tx, chargeId: number): Promise<Charge | undefined> {
  const matchId = tx.select({ matchId: charges.matchId }).from(charges).where(eq(charges.id, chargeId))
  const [match] = await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId)).for('update')
  if (!match) return

  const [charge] = await tx.select().from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.matchId, match.id))).for('update')
  return charge
}

type ChargeInput = { actorId: number; chargeId: number }

export async function waiveCharge(
  db: Db,
  input: ChargeInput & { reason: string },
  now = new Date(),
): Promise<Result<Charge, 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_REASON' | 'ALREADY_WAIVED'>> {
  const { actorId, chargeId } = input
  if (!await isAdmin(db, actorId)) return err('FORBIDDEN')
  const reason = input.reason.trim()
  if (!reason) return err('INVALID_REASON')

  return db.transaction(async tx => {
    const charge = await lockCharge(tx, chargeId)
    if (!charge) return err('NOT_FOUND')
    if (charge.status === 'waived') return err('ALREADY_WAIVED')

    const update = { ...waiver(actorId, reason), updatedAt: now }
    await tx.update(charges).set(update).where(eq(charges.id, chargeId))
    await writeAudit(tx, { actorId, action: 'charge.waive', entity: 'charge', entityId: String(chargeId), detail: { reason } })
    return ok({ ...charge, ...update })
  })
}

export async function restoreCharge(
  db: Db,
  { actorId, chargeId }: ChargeInput,
): Promise<Result<Charge, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_WAIVED'>> {
  if (!await isAdmin(db, actorId)) return err('FORBIDDEN')

  return db.transaction(async tx => {
    const charge = await lockCharge(tx, chargeId)
    if (!charge) return err('NOT_FOUND')
    if (charge.status !== 'waived') return err('NOT_WAIVED')

    await tx.update(charges).set(charged).where(eq(charges.id, chargeId))
    await writeAudit(tx, { actorId, action: 'charge.restore', entity: 'charge', entityId: String(chargeId) })
    const [restored] = await tx.select().from(charges).where(eq(charges.id, chargeId)).for('update')
    return ok(restored)
  })
}
