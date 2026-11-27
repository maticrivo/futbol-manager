import { and, asc, DrizzleQueryError, eq, gt, isNotNull } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { Db, Executor } from '@/db'
import { entries, matches, users, notificationLog, notificationPrefs } from '@/db/schema'
import { notificationCopy } from '@/lib/notificationCopy'
import { sendWebPush, type NotificationPayload, type PushTransport } from '@/lib/push'
import { err, ok, type Result } from '@/lib/result'
import { billingMonthOf, TZ } from '@/lib/time'
import type { BagDuty } from './bag'
import type { Entry } from './entries'
import type { Match } from './matches'
import { answeredMemberIds } from './responses'

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
  bag_duty: true,
} satisfies Record<NotificationCategory, true>

export const NOTIFICATION_CATEGORIES = Object.keys(CATEGORY_DEFAULTS) as NotificationCategory[]

export async function listNotificationPrefs(
  db: Db, memberId: string,
): Promise<Record<NotificationCategory, boolean>> {
  const rows = await db.select({ category: notificationPrefs.category, enabled: notificationPrefs.enabled })
    .from(notificationPrefs).where(eq(notificationPrefs.memberId, memberId))
  const prefs: Record<NotificationCategory, boolean> = { ...CATEGORY_DEFAULTS }
  for (const row of rows) prefs[row.category] = row.enabled
  return prefs
}

export async function setNotificationPref(
  db: Executor, memberId: string, category: NotificationCategory, enabled: boolean,
): Promise<void> {
  await db.insert(notificationPrefs).values({ memberId, category, enabled })
    .onConflictDoUpdate({ target: [notificationPrefs.memberId, notificationPrefs.category], set: { enabled } })
}

type NotificationData = {
  matchDate?: string; venue?: string; url: string; month?: string; name?: string; backup?: string
}

export function buildNotification(event: NotificationCategory, locale: string, data: NotificationData): NotificationPayload {
  const copy = notificationCopy[event][locale === 'he' || locale === 'es' ? locale : 'en']
  const substitutions: Record<string, string> = {
    date: data.matchDate ?? '',
    month: data.month ?? '',
    venue: data.venue ?? '',
    name: data.name ?? '',
    backup: data.backup ?? '',
  }
  const render = (template: string) =>
    template.replace(/\{\{(date|month|venue|name|backup)\}\}/g, (_, key: string) => substitutions[key]).trim()
  return { title: render(copy.title), body: render(copy.body), url: data.url }
}

type MemberNotification = {
  memberId: string
  category: NotificationCategory
  eventKey: string
  payload: NotificationPayload
  now: Date
}

export async function sendMemberNotification(
  db: Db, { memberId, category, eventKey, payload, now }: MemberNotification, transport: PushTransport,
): Promise<boolean> {
  const [member] = await db.select({ status: users.status }).from(users)
    .where(eq(users.id, memberId))
  if (member?.status !== 'active') return false

  const [pref] = await db.select({ enabled: notificationPrefs.enabled }).from(notificationPrefs)
    .where(and(eq(notificationPrefs.memberId, memberId), eq(notificationPrefs.category, category)))
  if (pref?.enabled === false) return false

  // Claim the event before sending. Keep the claim even if no delivery is accepted.
  try {
    await db.insert(notificationLog).values({ eventKey, memberId, sentAt: now })
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505') {
      return false
    }
    throw error
  }

  return (await sendWebPush(db, memberId, payload, transport)).sent > 0
}

function matchData(match: Match): NotificationData {
  return { matchDate: match.matchDate, venue: match.venue, url: '/' }
}

function displayName(user: { name: string | null; nickname: string | null } | undefined): string {
  return user?.nickname?.trim() || user?.name || ''
}

export async function notifyBagDuty(
  db: Db,
  input: { match: Match; duty: BagDuty; transport: PushTransport; now: Date },
): Promise<number> {
  const { match, duty, transport, now } = input

  const [assigned] = await db.select({ name: users.name, nickname: users.nickname }).from(users)
    .where(eq(users.id, duty.assignedMemberId))
  if (!assigned) return 0
  const name = displayName(assigned)

  let backupName = ''
  if (duty.backupMemberId) {
    const [backup] = await db.select({ name: users.name, nickname: users.nickname }).from(users)
      .where(eq(users.id, duty.backupMemberId))
    backupName = displayName(backup)
  }

  const roster = await db.select({ id: users.id, locale: users.locale })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.memberId))
    .where(and(
      eq(entries.matchId, match.id),
      eq(entries.status, 'confirmed'),
      eq(entries.kind, 'member'),
      isNotNull(entries.memberId),
    ))

  let sent = 0
  for (const member of roster) {
    const payload = buildNotification('bag_duty', member.locale, {
      name, backup: backupName || '—', url: '/',
    })
    if (await sendMemberNotification(db, {
      memberId: member.id,
      category: 'bag_duty',
      eventKey: `bag_duty:match:${match.id}`,
      payload,
      now,
    }, transport)) sent++
  }
  return sent
}

export async function sendPaymentReminder(
  db: Db,
  input: { actorId: string; memberId: string; now: Date },
  transport: PushTransport,
): Promise<Result<{ sent: boolean }, 'FORBIDDEN' | 'NOT_FOUND'>> {
  const { actorId, memberId, now } = input

  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId))
  if (actor?.role !== 'admin') return err('FORBIDDEN')

  const [member] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, memberId))
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
    const [member] = await db.select({ locale: users.locale }).from(users)
      .where(and(eq(users.id, entry.memberId), eq(users.status, 'active')))
    if (!member) return false

    return sendMemberNotification(db, {
      memberId: entry.memberId,
      category: 'queue_offer',
      // Rows are reused when a member rejoins, so each offer is keyed by when it was made.
      eventKey: `queue_offer:${entry.id}:${entry.offeredAt?.getTime() ?? 0}`,
      payload: buildNotification('queue_offer', member.locale, matchData(match)),
      now: now ?? new Date(),
    }, transport)
  }

  const sent = await sendOffer()
  if (now) return sent
}

const MINUTE = 60_000

// Pushes that ask for an answer go only to members who have not given one.
const ASKS_FOR_ANSWER: ReadonlySet<NotificationCategory> = new Set(['signup_open', 'lock_reminder'])

export async function processDueNotifications(db: Db, now: Date, transport: PushTransport): Promise<{ sent: number }> {
  const due: { category: NotificationCategory; eventKey: string; data: NotificationData; matchId?: number }[] = []
  const scheduled = await db.select().from(matches)
    .where(eq(matches.status, 'scheduled'))
    .orderBy(asc(matches.kickoffAt))
  for (const match of scheduled) {
    const windows = [
      ['signup_open', match.signupOpensAt.getTime()],
      ['guest_phase', match.guestPhaseAt.getTime()],
      ['lock_reminder', match.lockAt.getTime() - 90 * MINUTE],
    ] as const
    for (const [category, start] of windows) {
      if (now.getTime() >= start && now.getTime() <= start + 30 * MINUTE) {
        due.push({ category, eventKey: `${category}:match:${match.id}`, data: matchData(match), matchId: match.id })
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
    const activeMembers = await db.select({ id: users.id, locale: users.locale }).from(users)
      .where(eq(users.status, 'active'))
    for (const { category, eventKey, data, matchId } of due) {
      const answered = matchId !== undefined && ASKS_FOR_ANSWER.has(category)
        ? await answeredMemberIds(db, matchId)
        : null
      for (const member of activeMembers) {
        if (answered?.has(member.id)) continue
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
