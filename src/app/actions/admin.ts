'use server'

import { DateTime } from 'luxon'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getDb } from '@/db'
import { createMember, regenerateInvite, setMemberStatus } from '@/domain/members'
import { createMatchForDate, createNextMatch, getUpcomingMatch, updateSettings, type Settings } from '@/domain/matches'
import type { ActionResult, InviteActionResult } from '@/lib/actions'
import { requireAdmin } from '@/lib/auth'
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

  const rawName = formData.get('name')
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name || name.length > 80) {
    return { ok: false, code: 'INVALID_NAME' }
  }

  const role = formData.get('role') === 'admin' ? 'admin' : 'member'
  const localeValue = formData.get('locale')
  const locale = localeValue === 'he' || localeValue === 'es' ? localeValue : 'en'

  const { inviteToken } = await createMember(db, { name, role, locale })

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
  if (statusValue !== 'active' && statusValue !== 'disabled') {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const result = await setMemberStatus(db, admin.id, memberId, statusValue)
  if (!result.ok) {
    return { ok: false, code: result.code }
  }

  revalidatePath('/admin/members')
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
