import { and, asc, DrizzleQueryError, eq, gt } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { Db, Executor } from '@/db'
import { entries, matches, members, notificationLog, notificationPrefs } from '@/db/schema'
import { notificationCopy } from '@/lib/notificationCopy'
import { sendWebPush, type NotificationPayload, type PushTransport } from '@/lib/push'
import { err, ok, type Result } from '@/lib/result'
import { billingMonthOf, TZ } from '@/lib/time'
import type { Entry } from './entries'
import type { Match } from './matches'

export { deletePushSubscription, savePushSubscription, sendWebPush } from '@/lib/push'
export type { NotificationPayload, PushSubscriptionRow, PushTransport } from '@/lib/push'
export type NotificationCategory = typeof notificationPrefs.$inferSelect.category

const CATEGORY_DEFAULTS = {
  signup_open: true,
  guest_phase: true,
  lock_reminder: true,
  queue_offer: true,
  bill_ready: true,
  payment_reminder: true,
} satisfies Record<NotificationCategory, true>

export const NOTIFICATION_CATEGORIES = Object.keys(CATEGORY_DEFAULTS) as NotificationCategory[]

export async function listNotificationPrefs(
  db: Db, memberId: number,
): Promise<Record<NotificationCategory, boolean>> {
  const rows = await db.select({ category: notificationPrefs.category, enabled: notificationPrefs.enabled })
    .from(notificationPrefs).where(eq(notificationPrefs.memberId, memberId))
  const prefs: Record<NotificationCategory, boolean> = { ...CATEGORY_DEFAULTS }
  for (const row of rows) prefs[row.category] = row.enabled
  return prefs
}

export async function setNotificationPref(
  db: Executor, memberId: number, category: NotificationCategory, enabled: boolean,
): Promise<void> {
  await db.insert(notificationPrefs).values({ memberId, category, enabled })
    .onDuplicateKeyUpdate({ set: { enabled } })
}

type NotificationData = { matchDate?: string; venue?: string; url: string; month?: string }

export function buildNotification(event: NotificationCategory, locale: string, data: NotificationData): NotificationPayload {
  const copy = notificationCopy[event][locale === 'he' || locale === 'es' ? locale : 'en']
  const substitutions: Record<string, string> = {
    date: data.matchDate ?? '',
    month: data.month ?? '',
    venue: data.venue ?? '',
  }
  const render = (template: string) =>
    template.replace(/\{\{(date|month|venue)\}\}/g, (_, key: string) => substitutions[key]).trim()
  return { title: render(copy.title), body: render(copy.body), url: data.url }
}

type MemberNotification = {
  memberId: number
  category: NotificationCategory
  eventKey: string
  payload: NotificationPayload
  now: Date
}

export async function sendMemberNotification(
  db: Db, { memberId, category, eventKey, payload, now }: MemberNotification, transport: PushTransport,
): Promise<boolean> {
  const [member] = await db.select({ status: members.status }).from(members)
    .where(eq(members.id, memberId))
  if (member?.status !== 'active') return false

  const [pref] = await db.select({ enabled: notificationPrefs.enabled }).from(notificationPrefs)
    .where(and(eq(notificationPrefs.memberId, memberId), eq(notificationPrefs.category, category)))
  if (pref?.enabled === false) return false

  // Claim the event before sending. Keep the claim even if no delivery is accepted.
  try {
    await db.insert(notificationLog).values({ eventKey, memberId, sentAt: now })
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ER_DUP_ENTRY') {
      return false
    }
    throw error
  }

  return (await sendWebPush(db, memberId, payload, transport)).sent > 0
}

function matchData(match: Match): NotificationData {
  return { matchDate: match.matchDate, venue: match.venue, url: '/' }
}

export async function sendPaymentReminder(
  db: Db,
  input: { actorId: number; memberId: number; now: Date },
  transport: PushTransport,
): Promise<Result<{ sent: boolean }, 'FORBIDDEN' | 'NOT_FOUND'>> {
  const { actorId, memberId, now } = input

  const [actor] = await db.select({ role: members.role }).from(members).where(eq(members.id, actorId))
  if (actor?.role !== 'admin') return err('FORBIDDEN')

  const [member] = await db.select({ locale: members.locale }).from(members).where(eq(members.id, memberId))
  if (!member) return err('NOT_FOUND')

  const eventKey = `payment_reminder:${memberId}:${DateTime.fromJSDate(now, { zone: TZ }).toFormat("yyyy-MM-dd'T'HH:mm")}`
  const payload = buildNotification('payment_reminder', member.locale, { month: billingMonthOf(now), url: '/bill' })
  const sent = await sendMemberNotification(db, {
    memberId, category: 'payment_reminder', eventKey, payload, now,
  }, transport)
  return ok({ sent })
}

export function notifyOffer(db: Db, entry: Entry, match: Match, transport: PushTransport): Promise<void>
// The tick supplies its clock and needs to know whether this offer counted as sent.
export function notifyOffer(db: Db, entry: Entry, match: Match, transport: PushTransport, now: Date): Promise<boolean>
export async function notifyOffer(db: Db, entry: Entry, match: Match, transport: PushTransport, now?: Date): Promise<void | boolean> {
  const sendOffer = async (): Promise<boolean> => {
    if (entry.memberId === null) return false
    const [member] = await db.select({ locale: members.locale }).from(members)
      .where(and(eq(members.id, entry.memberId), eq(members.status, 'active')))
    if (!member) return false

    return sendMemberNotification(db, {
      memberId: entry.memberId,
      category: 'queue_offer',
      eventKey: `queue_offer:${entry.id}`,
      payload: buildNotification('queue_offer', member.locale, matchData(match)),
      now: now ?? new Date(),
    }, transport)
  }

  const sent = await sendOffer()
  if (now) return sent
}

const MINUTE = 60_000

export async function processDueNotifications(db: Db, now: Date, transport: PushTransport): Promise<{ sent: number }> {
  const due: { category: NotificationCategory; eventKey: string; data: NotificationData }[] = []
  const scheduled = await db.select().from(matches)
    .where(eq(matches.status, 'scheduled'))
    .orderBy(asc(matches.kickoffAt))
  for (const match of scheduled) {
    const windows = [
      ['signup_open', match.signupOpensAt.getTime() + 9 * 60 * MINUTE],
      ['guest_phase', match.guestPhaseAt.getTime()],
      ['lock_reminder', match.lockAt.getTime() - 90 * MINUTE],
    ] as const
    for (const [category, start] of windows) {
      if (now.getTime() >= start && now.getTime() <= start + 30 * MINUTE) {
        due.push({ category, eventKey: `${category}:match:${match.id}`, data: matchData(match) })
      }
    }
  }

  const local = DateTime.fromJSDate(now, { zone: TZ })
  const localNine = local.startOf('day').set({ hour: 9 })
  if (local.day === 1 && Math.abs(now.getTime() - localNine.toMillis()) <= 30 * MINUTE) {
    const month = local.minus({ months: 1 }).toFormat('yyyy-MM')
    due.push({ category: 'bill_ready', eventKey: `bill_ready:${month}`, data: { month, url: '/bill' } })
  }

  let sent = 0
  if (due.length) {
    const activeMembers = await db.select({ id: members.id, locale: members.locale }).from(members)
      .where(eq(members.status, 'active'))
    for (const { category, eventKey, data } of due) {
      for (const member of activeMembers) {
        const payload = buildNotification(category, member.locale, data)
        if (await sendMemberNotification(db, { memberId: member.id, category, eventKey, payload, now }, transport)) sent++
      }
    }
  }

  const liveOffers = await db.select().from(entries)
    .innerJoin(matches, eq(entries.matchId, matches.id))
    .where(and(eq(entries.status, 'offered'), gt(entries.offerExpiresAt, now)))
  for (const { entries: entry, matches: offerMatch } of liveOffers) {
    if (await notifyOffer(db, entry, offerMatch, transport, now)) sent++
  }

  return { sent }
}
