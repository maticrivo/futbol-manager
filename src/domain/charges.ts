import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '@/db'
import { charges, matches, members } from '@/db/schema'
import { err, ok, type Result } from '@/lib/result'
import { billingMonthOf } from '@/lib/time'
import { allocateAvailableCredit } from './allocations'
import { writeAudit } from './audit'
import type { Match } from './matches'

export type Charge = typeof charges.$inferSelect

// Lock the match first: billing can hold it while checking member foreign keys.
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
  const sortedIds = [...new Set(memberIds)].sort((a, b) => a - b)
  await tx.select().from(members).where(inArray(members.id, sortedIds)).orderBy(asc(members.id)).for('update')
  for (const memberId of sortedIds) {
    await allocateAvailableCredit(tx, memberId, now)
  }
  return result.affectedRows
}

export async function chargeAddedMember(tx: Tx, match: Match, memberId: number, now: Date): Promise<void> {
  // A member re-added after removal already has a charge; bill them again on that same row.
  await tx.insert(charges).values(newCharge(match, memberId, now))
    .onDuplicateKeyUpdate({ set: { ...charged, updatedAt: now } })
  // Caller (adminAddEntry) holds the member lock.
  await allocateAvailableCredit(tx, memberId, now)
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

async function lockMatchForCharge(tx: Tx, chargeId: number) {
  const matchId = tx.select({ matchId: charges.matchId }).from(charges).where(eq(charges.id, chargeId))
  const [match] = await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId)).for('update')
  return match
}

async function lockCharge(tx: Tx, chargeId: number, matchId: number): Promise<Charge | undefined> {
  const [charge] = await tx.select().from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.matchId, matchId))).for('update')
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
    const match = await lockMatchForCharge(tx, chargeId)
    if (!await lockAdminActor(tx, actorId)) return err('FORBIDDEN')
    const reason = input.reason.trim()
    if (!isValidReason(reason)) return err('INVALID_REASON')

    if (!match) return err('NOT_FOUND')
    const charge = await lockCharge(tx, chargeId, match.id)
    if (!charge) return err('NOT_FOUND')
    if (charge.status === 'waived') return err('ALREADY_WAIVED')

    return ok(await applyWaiver(tx, charge, actorId, reason, now))
  })
}

export type MatchCharge = Charge & { memberName: string }

export async function listMatchCharges(db: Db, matchId: number): Promise<MatchCharge[]> {
  const rows = await db.select({ charge: charges, memberName: members.name })
    .from(charges)
    .innerJoin(members, eq(members.id, charges.memberId))
    .where(eq(charges.matchId, matchId))
    .orderBy(charges.memberId, charges.id)
  return rows.map(({ charge, memberName }) => ({ ...charge, memberName }))
}

export async function restoreCharge(
  db: Db,
  { actorId, chargeId }: ChargeInput,
  now = new Date(),
): Promise<Result<Charge, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_WAIVED'>> {
  return db.transaction(async tx => {
    const match = await lockMatchForCharge(tx, chargeId)
    const [target] = await tx.select({ memberId: charges.memberId }).from(charges).where(eq(charges.id, chargeId))
    const memberIds = [...new Set([actorId, ...(target ? [target.memberId] : [])])].sort((a, b) => a - b)
    let actorRole: (typeof members.$inferSelect)['role'] | undefined
    for (const id of memberIds) {
      const [member] = await tx.select({ role: members.role }).from(members).where(eq(members.id, id)).for('update')
      if (id === actorId) actorRole = member?.role
    }
    if (actorRole !== 'admin') return err('FORBIDDEN')
    if (!match) return err('NOT_FOUND')
    const charge = await lockCharge(tx, chargeId, match.id)
    if (!charge) return err('NOT_FOUND')
    if (charge.status !== 'waived') return err('NOT_WAIVED')

    const update = { ...charged, updatedAt: now }
    await tx.update(charges).set(update).where(eq(charges.id, chargeId))
    await allocateAvailableCredit(tx, charge.memberId, now)
    await writeAudit(tx, { actorId, action: 'charge.restore', entity: 'charge', entityId: String(chargeId), createdAt: now })
    return ok({ ...charge, ...update })
  })
}
