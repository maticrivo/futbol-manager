'use server'

import { and, eq } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getDb } from '@/db'
import { charges, entries, guestPayments } from '@/db/schema'
import { cancelMatch, recordGuestPayment, recordPayment, refundGuestPayment, setMonthlyExpense } from '@/domain/billing'
import { restoreCharge, waiveCharge } from '@/domain/charges'
import { adminAddEntry, adminRemoveEntry, advanceMatch, setAttendance } from '@/domain/lock'
import { createMember, regenerateInvite, setMemberStatus } from '@/domain/members'
import { sendPaymentReminder } from '@/domain/notifications'
import {
  createMatchForDate, createNextMatch, getUpcomingMatch, updateMatch, updateSettings, type Settings, type UpdateMatchPatch,
} from '@/domain/matches'
import type { ActionResult, InviteActionResult } from '@/lib/actions'
import { requireAdmin } from '@/lib/auth'
import { defaultTransport } from '@/lib/push'
import { requestOrigin } from '@/lib/request-origin'
import { TZ } from '@/lib/time'

function positiveId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function inviteUrl(token: string): Promise<string> {
  const origin = requestOrigin(await headers(), process.env.APP_URL ?? 'http://localhost:3000')
  return `${origin}/login/${token}`
}

export async function createNextMatchAction(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  void _formData
  await requireAdmin()
  const db = getDb()
  const now = new Date()
  const upcoming = await getUpcomingMatch(db, now)
  if (upcoming) {
    await createNextMatch(db, upcoming.id)
  } else {
    const today = DateTime.fromJSDate(now, { zone: TZ })
    const weekday = today.weekday
    const days = ((2 - weekday + 7) % 7) || 7
    const nextTuesday = today.plus({ days }).toISODate()
    if (nextTuesday) await createMatchForDate(db, nextTuesday)
  }

  revalidatePath('/')
  revalidatePath('/admin')
  return { ok: true }
}

export async function addMemberAction(_prev: InviteActionResult | null, formData: FormData): Promise<InviteActionResult> {
  await requireAdmin()
  const db = getDb()

  const rawEmail = formData.get('email')
  const rawName = formData.get('name')
  const name = typeof rawEmail === 'string' && rawEmail.trim()
    ? rawEmail.trim()
    : typeof rawName === 'string'
      ? rawName.trim()
      : ''
  if (!name || (formData.has('email') ? name.length > 120 : name.length > 80)) {
    return { ok: false, code: 'INVALID_NAME' }
  }

  const role = formData.get('role') === 'admin' ? 'admin' : 'member'
  const localeValue = formData.get('locale')
  const locale = localeValue === 'he' || localeValue === 'es' ? localeValue : 'en'
  const statusValue = formData.get('status')
  const status = statusValue === 'pending' || statusValue === 'disabled' ? statusValue : 'active'

  const { inviteToken } = await createMember(db, { name, role, locale, status })

  revalidatePath('/admin/members')
  revalidatePath('/admin')
  return { ok: true, inviteUrl: await inviteUrl(inviteToken) }
}

export async function regenerateInviteAction(_prev: InviteActionResult | null, formData: FormData): Promise<InviteActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const memberId = positiveId(formData.get('memberId'))
  if (memberId === null) {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const result = await regenerateInvite(db, admin.id, memberId)
  if (!result.ok) {
    return { ok: false, code: result.code }
  }

  revalidatePath('/admin/members')
  return { ok: true, inviteUrl: await inviteUrl(result.value.inviteToken) }
}

export async function setMemberStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const memberId = positiveId(formData.get('memberId'))
  if (memberId === null) {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const statusValue = formData.get('status')
  if (statusValue !== 'active' && statusValue !== 'disabled' && statusValue !== 'pending') {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const result = await setMemberStatus(db, admin.id, memberId, statusValue)
  if (!result.ok) {
    return { ok: false, code: result.code }
  }

  revalidatePath('/admin/members')
  revalidatePath('/admin')
  revalidatePath('/')
  return { ok: true }
}

const KICKOFF_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const COST_REGEX = /^\d+(?:\.\d{1,2})?$/

export async function updateSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const patch: Partial<Settings> = {}

  const capacity = typeof formData.get('capacity') === 'string' ? Number(formData.get('capacity')) : NaN
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 40) {
    return { ok: false, code: 'INVALID_SETTING' }
  }
  patch.capacity = capacity

  const costValue = formData.get('costShekels')
  const cost = typeof costValue === 'string' ? costValue.trim() : ''
  if (!COST_REGEX.test(cost)) {
    return { ok: false, code: 'INVALID_SETTING' }
  }
  patch.costAgorot = Math.round(Number(cost) * 100)

  const venueValue = formData.get('venue')
  const venue = typeof venueValue === 'string' ? venueValue.trim() : ''
  if (venue.length > 120) {
    return { ok: false, code: 'INVALID_SETTING' }
  }
  patch.venue = venue

  const kickoffValue = formData.get('kickoffTime')
  const kickoffTime = typeof kickoffValue === 'string' ? kickoffValue.trim() : ''
  if (!KICKOFF_REGEX.test(kickoffTime)) {
    return { ok: false, code: 'INVALID_SETTING' }
  }
  patch.kickoffTime = kickoffTime

  const queueWindowMinutes = typeof formData.get('queueWindowMinutes') === 'string' ? Number(formData.get('queueWindowMinutes')) : NaN
  if (!Number.isInteger(queueWindowMinutes)) {
    return { ok: false, code: 'INVALID_SETTING' }
  }
  patch.queueWindowMinutes = queueWindowMinutes

  const result = await updateSettings(db, admin.id, patch)
  if (!result.ok) {
    return { ok: false, code: result.code }
  }

  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/admin/settings')
  return { ok: true }
}

function revalidateMatch(matchId: number) {
  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath(`/admin/matches/${matchId}`)
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function shekelsToAgorot(value: string): number | null {
  const trimmed = value.trim()
  if (!COST_REGEX.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}

function parseLocalDate(formData: FormData, name: string): Date | null {
  const value = stringField(formData, name)
  if (!value) return null
  const parsed = DateTime.fromISO(value, { zone: TZ })
  return parsed.isValid ? parsed.toJSDate() : null
}

export async function updateMatchAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  if (matchId === null) return { ok: false, code: 'NOT_FOUND' }

  const patch: UpdateMatchPatch = {}

  if (formData.has('capacity')) {
    const capacity = Number(formData.get('capacity'))
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 40) return { ok: false, code: 'INVALID_PATCH' }
    patch.capacity = capacity
  }
  if (formData.has('costShekels')) {
    const costAgorot = shekelsToAgorot(stringField(formData, 'costShekels'))
    if (costAgorot === null) return { ok: false, code: 'INVALID_PATCH' }
    patch.costAgorot = costAgorot
  }
  if (formData.has('venue')) {
    const venue = stringField(formData, 'venue').trim()
    if (venue.length > 120) return { ok: false, code: 'INVALID_PATCH' }
    patch.venue = venue
  }
  if (formData.has('notes')) {
    const notes = stringField(formData, 'notes').trim()
    if ([...notes].length > 2000) return { ok: false, code: 'INVALID_PATCH' }
    patch.notes = notes
  }
  for (const field of ['kickoffAt', 'signupOpensAt', 'guestPhaseAt', 'lockAt'] as const) {
    if (formData.has(field)) {
      const value = parseLocalDate(formData, field)
      if (value === null) return { ok: false, code: 'INVALID_PATCH' }
      patch[field] = value
    }
  }

  const result = await updateMatch(db, { actorId: admin.id, matchId, now: new Date(), patch })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function cancelMatchAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  if (matchId === null) return { ok: false, code: 'NOT_FOUND' }

  const reason = stringField(formData, 'reason')
  const now = new Date()
  await advanceMatch(db, matchId, now)
  const result = await cancelMatch(db, { actorId: admin.id, matchId, now, reason })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function adminAddEntryAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const memberId = positiveId(formData.get('memberId'))
  if (matchId === null || memberId === null) return { ok: false, code: 'NOT_FOUND' }

  const reason = stringField(formData, 'reason')
  const now = new Date()
  await advanceMatch(db, matchId, now)
  const result = await adminAddEntry(db, { actorId: admin.id, matchId, memberId, now, reason })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function adminRemoveEntryAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const entryId = positiveId(formData.get('entryId'))
  if (matchId === null || entryId === null) return { ok: false, code: 'NOT_FOUND' }

  const [entry] = await db.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.matchId, matchId)))
  if (!entry) return { ok: false, code: 'NOT_FOUND' }

  const reason = stringField(formData, 'reason')
  const result = await adminRemoveEntry(db, { actorId: admin.id, entryId, now: new Date(), reason })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function waiveChargeAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const chargeId = positiveId(formData.get('chargeId'))
  if (matchId === null || chargeId === null) return { ok: false, code: 'NOT_FOUND' }

  const [charge] = await db.select({ id: charges.id }).from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.matchId, matchId)))
  if (!charge) return { ok: false, code: 'NOT_FOUND' }

  const reason = stringField(formData, 'reason')
  const result = await waiveCharge(db, { actorId: admin.id, chargeId, reason })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function restoreChargeAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const chargeId = positiveId(formData.get('chargeId'))
  if (matchId === null || chargeId === null) return { ok: false, code: 'NOT_FOUND' }

  const [charge] = await db.select({ id: charges.id }).from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.matchId, matchId)))
  if (!charge) return { ok: false, code: 'NOT_FOUND' }

  const result = await restoreCharge(db, { actorId: admin.id, chargeId })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function setAttendanceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const entryId = positiveId(formData.get('entryId'))
  if (matchId === null || entryId === null) return { ok: false, code: 'NOT_FOUND' }

  const [entry] = await db.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.matchId, matchId)))
  if (!entry) return { ok: false, code: 'NOT_FOUND' }

  const attendedValue = formData.get('attended')
  if (attendedValue !== 'present' && attendedValue !== 'absent') return { ok: false, code: 'NOT_FOUND' }

  const result = await setAttendance(db, { actorId: admin.id, entryId, attended: attendedValue === 'present' })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function recordGuestPaymentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const entryId = positiveId(formData.get('entryId'))
  if (matchId === null || entryId === null) return { ok: false, code: 'NOT_FOUND' }

  const [entry] = await db.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.matchId, matchId)))
  if (!entry) return { ok: false, code: 'NOT_FOUND' }

  const amountAgorot = shekelsToAgorot(stringField(formData, 'amountShekels'))
  if (amountAgorot === null) return { ok: false, code: 'INVALID_AMOUNT' }

  const note = stringField(formData, 'note').trim()
  const result = await recordGuestPayment(db, {
    actorId: admin.id, entryId, amountAgorot, paidAt: new Date(), note: note || undefined,
  })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

export async function refundGuestPaymentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const matchId = positiveId(formData.get('matchId'))
  const guestPaymentId = positiveId(formData.get('guestPaymentId'))
  if (matchId === null || guestPaymentId === null) return { ok: false, code: 'NOT_FOUND' }

  const [payment] = await db.select({ id: guestPayments.id }).from(guestPayments)
    .innerJoin(entries, eq(entries.id, guestPayments.entryId))
    .where(and(eq(guestPayments.id, guestPaymentId), eq(entries.matchId, matchId)))
  if (!payment) return { ok: false, code: 'NOT_FOUND' }

  const note = stringField(formData, 'note').trim()
  const result = await refundGuestPayment(db, {
    actorId: admin.id, guestPaymentId, now: new Date(), note: note || undefined,
  })
  if (!result.ok) return { ok: false, code: result.code }

  revalidateMatch(matchId)
  return { ok: true }
}

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export async function recordPaymentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const memberId = positiveId(formData.get('memberId'))
  if (memberId === null) return { ok: false, code: 'NOT_FOUND' }

  const amountValue = stringField(formData, 'amountShekels').trim()
  if (!COST_REGEX.test(amountValue)) return { ok: false, code: 'INVALID_AMOUNT' }
  const amountAgorot = Math.round(Number(amountValue) * 100)
  if (amountAgorot <= 0) return { ok: false, code: 'INVALID_AMOUNT' }

  const methodValue = formData.get('method')
  const method = methodValue === 'paybox' || methodValue === 'cash' || methodValue === 'other' ? methodValue : 'cash'

  const targetMonthValue = stringField(formData, 'targetMonth').trim()
  if (targetMonthValue.length > 0 && !MONTH_REGEX.test(targetMonthValue)) {
    return { ok: false, code: 'INVALID_MONTH' }
  }
  const targetMonth = targetMonthValue || undefined

  const note = stringField(formData, 'note').trim().slice(0, 255)

  const result = await recordPayment(db, {
    actorId: admin.id, memberId, amountAgorot, paidAt: new Date(), method,
    note: note || undefined, targetMonth,
  })
  if (!result.ok) return { ok: false, code: result.code }

  revalidatePath('/admin/money')
  revalidatePath('/admin')
  return { ok: true }
}

export async function setExpenseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const month = stringField(formData, 'month').trim()
  if (!MONTH_REGEX.test(month)) return { ok: false, code: 'INVALID_MONTH' }

  const fieldCostValue = stringField(formData, 'fieldCostShekels').trim()
  if (!COST_REGEX.test(fieldCostValue)) return { ok: false, code: 'INVALID_AMOUNT' }
  const fieldCostAgorot = Math.round(Number(fieldCostValue) * 100)

  const result = await setMonthlyExpense(db, { actorId: admin.id, month, fieldCostAgorot })
  if (!result.ok) return { ok: false, code: result.code }

  revalidatePath('/admin/money')
  revalidatePath('/admin')
  return { ok: true }
}

export async function sendReminderAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const memberId = positiveId(formData.get('memberId'))
  if (memberId === null) return { ok: false, code: 'NOT_FOUND' }

  const result = await sendPaymentReminder(db, { actorId: admin.id, memberId, now: new Date() }, defaultTransport)
  if (!result.ok) return { ok: false, code: result.code }

  revalidatePath('/admin/money')
  return { ok: true }
}
