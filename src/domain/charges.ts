import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db'
import { charges, matches, members } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { billingMonthOf } from '@/lib/time'
import { writeAudit } from './audit'
import type { Match } from './matches'

export type Charge = typeof charges.$inferSelect

// Take the actor lock before the match lock so a role change cannot race the write.
export async function lockAdminActor(tx: Tx, actorId: number): Promise<boolean> {
  const [actor] = await tx.select({ role: members.role }).from(members).where(eq(members.id, actorId)).for('update')
  return actor?.role === 'admin'
}

export function isValidReason(trimmed: string): boolean {
  return trimmed.length > 0 && [...trimmed].length <= 255
}

const charged = { status: 'charged', waivedBy: null, waiveReason: null } as const

async function applyWaiver(
  tx: Tx, charge: Charge, actorId: number, reason: string, now: Date, removedEntryId?: number,
): Promise<Charge> {
  const update = { status: 'waived', waivedBy: actorId, waiveReason: reason, updatedAt: now } as const
  await tx.update(charges).set(update).where(eq(charges.id, charge.id))
  const detail = removedEntryId === undefined
    ? { reason }
    : { reason, source: 'entry.admin_remove', entryId: removedEntryId }
  await writeAudit(tx, {
    actorId, action: 'charge.waive', entity: 'charge', entityId: String(charge.id), detail, createdAt: now,
  })
  return { ...charge, ...update }
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
  tx: Tx,
  { matchId, memberId, actorId, reason, now, entryId }: {
    matchId: number; memberId: number; actorId: number; reason: string; now: Date; entryId: number
  },
): Promise<void> {
  const [charge] = await tx.select().from(charges)
    .where(and(eq(charges.matchId, matchId), eq(charges.memberId, memberId))).for('update')
  if (charge?.status === 'charged') await applyWaiver(tx, charge, actorId, reason, now, entryId)
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
  return db.transaction(async tx => {
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    const reason = input.reason.trim()
    if (!isValidReason(reason)) return err('INVALID_REASON')

    const charge = await lockCharge(tx, chargeId)
    if (!charge) return err('NOT_FOUND')
    if (charge.status === 'waived') return err('ALREADY_WAIVED')

    return ok(await applyWaiver(tx, charge, actorId, reason, now))
  })
}

export async function restoreCharge(
  db: Db,
  { actorId, chargeId }: ChargeInput,
  now = new Date(),
): Promise<Result<Charge, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_WAIVED'>> {
  return db.transaction(async tx => {
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    const charge = await lockCharge(tx, chargeId)
    if (!charge) return err('NOT_FOUND')
    if (charge.status !== 'waived') return err('NOT_WAIVED')

    const update = { ...charged, updatedAt: now }
    await tx.update(charges).set(update).where(eq(charges.id, chargeId))
    await writeAudit(tx, { actorId, action: 'charge.restore', entity: 'charge', entityId: String(chargeId), createdAt: now })
    return ok({ ...charge, ...update })
  })
}
