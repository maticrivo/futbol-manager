import { eq } from 'drizzle-orm'
import { beforeEach, expect, it, vi } from 'vitest'
import { entries, matches, users, notificationLog, notificationPrefs, pushSubscriptions } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import {
  buildNotification,
  deletePushSubscription,
  notifyOffer,
  processDueNotifications,
  savePushSubscription,
  sendMemberNotification,
  sendWebPush,
} from '@/domain/notifications'
import { expireOffers } from '@/domain/queue'
import { testDb, resetDb } from '../db'

beforeEach(resetDb)

const now = new Date('2027-03-28T12:00:00.000Z')
const subscription = { endpoint: 'https://push/1', p256dh: 'k', auth: 'a' }
const transportOk = () => vi.fn().mockResolvedValue({ statusCode: 201 })
const matchFixture = () => createMatchForDate(testDb, '2027-03-30')

function lockReminder(memberId: string) {
  const payload = buildNotification('lock_reminder', 'en', { matchDate: '2027-03-30', url: '/match/1' })
  return { memberId, category: 'lock_reminder' as const, eventKey: 'lock_reminder:match:1', payload, now }
}

it('sends an event at most once per member', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const transport = transportOk()
  const input = lockReminder(member.id)

  expect(await sendMemberNotification(testDb, input, transport)).toBe(true)
  expect(await sendMemberNotification(testDb, input, transport)).toBe(false)
  expect(transport).toHaveBeenCalledTimes(1)
})

it('does not send or log an opted-out category', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  await testDb.insert(notificationPrefs).values({ memberId: member.id, category: 'lock_reminder', enabled: false })
  const transport = transportOk()

  expect(await sendMemberNotification(testDb, lockReminder(member.id), transport)).toBe(false)
  expect(transport).not.toHaveBeenCalled()
  expect(await testDb.select().from(notificationLog)).toEqual([])
})

it('does not send or log for a disabled member even with a valid subscription', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  await testDb.update(users).set({ status: 'disabled' }).where(eq(users.id, member.id))
  const transport = transportOk()

  expect(await sendMemberNotification(testDb, lockReminder(member.id), transport)).toBe(false)
  expect(transport).not.toHaveBeenCalled()
  expect(await testDb.select().from(notificationLog)).toEqual([])
})

it('does not send or log for a missing member', async () => {
  const transport = transportOk()

  expect(await sendMemberNotification(testDb, lockReminder('00000000-0000-4000-8000-000000000000'), transport)).toBe(false)
  expect(transport).not.toHaveBeenCalled()
  expect(await testDb.select().from(notificationLog)).toEqual([])
})

it('keeps the dedupe marker without subscriptions even if the member later subscribes', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  const transport = transportOk()
  const input = lockReminder(member.id)

  expect(await sendMemberNotification(testDb, input, transport)).toBe(false)
  expect(await testDb.select().from(notificationLog)).toMatchObject([
    { memberId: member.id, eventKey: input.eventKey, sentAt: now },
  ])
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  expect(await sendMemberNotification(testDb, input, transport)).toBe(false)
  expect(transport).not.toHaveBeenCalled()
})

it('returns false but keeps the dedupe marker if no delivery is accepted', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const transport = vi.fn().mockResolvedValue({ statusCode: 500 })
  const input = lockReminder(member.id)

  expect(await sendMemberNotification(testDb, input, transport)).toBe(false)
  expect(await sendMemberNotification(testDb, input, transport)).toBe(false)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await testDb.select().from(notificationLog)).toMatchObject([{ eventKey: input.eventKey, memberId: member.id }])
})

it('reassigns a resubscribed endpoint, replaces its keys, and can delete it twice', async () => {
  const { member: ana } = await createMember(testDb, { name: 'Ana' })
  const { member: ben } = await createMember(testDb, { name: 'Ben' })
  await savePushSubscription(testDb, { memberId: ana.id, ...subscription, userAgent: 'old browser' })
  const replacement = { endpoint: subscription.endpoint, memberId: ben.id, p256dh: 'new-k', auth: 'new-a' }
  await savePushSubscription(testDb, replacement)
  expect(await testDb.select().from(pushSubscriptions)).toMatchObject([{ ...replacement, userAgent: null }])

  await deletePushSubscription(testDb, subscription.endpoint)
  await deletePushSubscription(testDb, subscription.endpoint)
  expect(await testDb.select().from(pushSubscriptions)).toEqual([])
})

it('counts only 2xx deliveries and removes only 404 and 410 subscriptions', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  for (const statusCode of [199, 200, 299, 300, 404, 410, 500]) {
    await savePushSubscription(testDb, { ...subscription, memberId: member.id, endpoint: `https://push/${statusCode}` })
  }
  const transport = vi.fn(async ({ endpoint }: { endpoint: string }) => ({
    statusCode: Number(new URL(endpoint).pathname.slice(1)),
  }))

  expect(await sendWebPush(testDb, member.id, lockReminder(member.id).payload, transport)).toEqual({ sent: 2, removed: 2 })
  const remaining = await testDb.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)
  expect(remaining.map(row => row.endpoint).sort()).toEqual([199, 200, 299, 300, 500].map(code => `https://push/${code}`))
})

it('tries both devices and removes the stale second endpoint before rethrowing the first rejection', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const staleEndpoint = 'https://push/2'
  await savePushSubscription(testDb, { memberId: member.id, ...subscription, endpoint: staleEndpoint })
  const error = new Error('network failure')
  const transport = vi.fn(async ({ endpoint }: { endpoint: string }) => {
    if (endpoint === subscription.endpoint) throw error
    return { statusCode: 410 }
  })

  await expect(sendWebPush(testDb, member.id, lockReminder(member.id).payload, transport)).rejects.toBe(error)
  expect(transport.mock.calls.map(([row]) => row.endpoint)).toEqual([subscription.endpoint, staleEndpoint])
  expect(await testDb.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions))
    .toEqual([{ endpoint: subscription.endpoint }])
})

it.each(['he', 'en', 'es'])('builds all %s payloads with non-empty localized copy and the supplied URL', locale => {
  const url = '/match/1'
  for (const event of ['signup_open', 'guest_phase', 'lock_reminder', 'queue_offer', 'bill_ready', 'payment_reminder'] as const) {
    const payload = buildNotification(event, locale, { matchDate: '2027-03-30', venue: 'Pitch 1', month: '2027-03', url })
    expect(payload.title.trim()).not.toBe('')
    expect(payload.body.trim()).not.toBe('')
    expect(payload.url).toBe(url)
    expect(payload.title + payload.body).not.toContain('{{')
  }
  expect(buildNotification('signup_open', locale, { matchDate: '2027-03-30', venue: 'Pitch 1', url }).body)
    .toMatch(/2027-03-30.*Pitch 1/)
  expect(buildNotification('bill_ready', locale, { month: '2027-03', url }).body).toContain('2027-03')
})

it('falls back to English for unknown locales', () => {
  const data = { url: '/', matchDate: '2027-03-30' }
  const english = buildNotification('signup_open', 'en', data)
  expect(buildNotification('signup_open', 'he', data)).not.toEqual(english)
  expect(buildNotification('signup_open', 'es', data)).not.toEqual(english)
  expect(buildNotification('signup_open', 'toString', data)).toEqual(english)
})

it('notifies a promotion from expireOffers once using the entry ID', async () => {
  const match = await matchFixture()
  await testDb.update(matches).set({ capacity: 1 }).where(eq(matches.id, match.id))
  const { member: first } = await createMember(testDb, { name: 'First' })
  const { member: next } = await createMember(testDb, { name: 'Next' })
  await testDb.insert(entries).values([
    { matchId: match.id, kind: 'member', memberId: first.id, status: 'offered', offerExpiresAt: now },
    { matchId: match.id, kind: 'member', memberId: next.id, status: 'queued' },
  ])
  await savePushSubscription(testDb, { memberId: next.id, ...subscription })
  const transport = transportOk()
  const { expired, offered } = await expireOffers(testDb, match.id, now)
  expect(expired).toBe(1)
  if (!offered) throw new Error('Expected an offer after expiration')

  await notifyOffer(testDb, { ...offered, memberId: null }, match, transport)
  expect(transport).not.toHaveBeenCalled()
  await notifyOffer(testDb, offered, match, transport)
  await notifyOffer(testDb, offered, match, transport)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await testDb.select().from(notificationLog)).toMatchObject([
    { memberId: next.id, eventKey: `queue_offer:${offered.id}` },
  ])
})

it.each([
  ['signup_open', '2027-03-26T07:00:00.000Z', '2027-03-26T07:30:00.000Z'],
  ['guest_phase', '2027-03-29T11:00:00.000Z', '2027-03-29T11:30:00.000Z'],
  ['lock_reminder', '2027-03-30T09:30:00.000Z', '2027-03-30T10:00:00.000Z'],
] as const)('scans %s at both inclusive boundaries, deduping concurrent ticks', async (category, start, end) => {
  const match = await matchFixture()
  const { member: ana } = await createMember(testDb, { name: 'Ana', locale: 'es' })
  const { member: ben } = await createMember(testDb, { name: 'Ben', locale: 'he' })
  await savePushSubscription(testDb, { memberId: ana.id, ...subscription })
  await savePushSubscription(testDb, { memberId: ben.id, ...subscription, endpoint: 'https://push/2' })
  const transport = transportOk()
  const opening = new Date(start)
  const closing = new Date(end)
  expect(await processDueNotifications(testDb, new Date(+opening - 1), transport)).toEqual({ sent: 0 })
  expect(await processDueNotifications(testDb, new Date(+closing + 1), transport)).toEqual({ sent: 0 })
  expect(await testDb.select().from(notificationLog)).toEqual([])

  const results = await Promise.all([
    processDueNotifications(testDb, opening, transport),
    processDueNotifications(testDb, opening, transport),
  ])
  expect(results.reduce((total, result) => total + result.sent, 0)).toBe(2)
  expect(transport).toHaveBeenCalledWith(
    expect.objectContaining({ memberId: ana.id }),
    buildNotification(category, 'es', { matchDate: '2027-03-30', venue: match.venue, url: '/' }),
  )
  expect(transport).toHaveBeenCalledWith(
    expect.objectContaining({ memberId: ben.id }),
    buildNotification(category, 'he', { matchDate: '2027-03-30', venue: match.venue, url: '/' }),
  )
  expect(await processDueNotifications(testDb, closing, transport)).toEqual({ sent: 0 })
  await testDb.delete(notificationLog)
  expect(await processDueNotifications(testDb, closing, transport)).toEqual({ sent: 2 })
  const closingLogs = await testDb.select().from(notificationLog)
  expect(closingLogs.map((row) => row.memberId).sort()).toEqual([ana.id, ben.id].sort())
  for (const member of [ana, ben]) {
    expect(closingLogs.find((row) => row.memberId === member.id)).toMatchObject({
      eventKey: `${category}:match:${match.id}`,
      sentAt: closing,
    })
  }
})

it('sends the later scheduled match notification when only its window is due', async () => {
  await matchFixture()
  const later = await createMatchForDate(testDb, '2027-03-31')
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const transport = transportOk()
  const laterSignupWindow = new Date('2027-03-27T06:00:00.000Z')

  expect(await processDueNotifications(testDb, laterSignupWindow, transport)).toEqual({ sent: 1 })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await testDb.select().from(notificationLog)).toMatchObject([
    { eventKey: `signup_open:match:${later.id}`, memberId: member.id, sentAt: laterSignupWindow },
  ])
})

it('scans every live offer, skipping expired offers and disabled users', async () => {
  const match = await matchFixture()
  const anotherMatch = await createMatchForDate(testDb, '2027-04-06')
  const { member: live } = await createMember(testDb, { name: 'Live' })
  const { member: expired } = await createMember(testDb, { name: 'Expired' })
  const { member: disabled } = await createMember(testDb, { name: 'Disabled' })
  await testDb.update(users).set({ status: 'disabled' }).where(eq(users.id, disabled.id))
  const future = new Date('2027-03-28T12:30:00.000Z')
  const [firstOffer, secondOffer] = await testDb.insert(entries).values([
    { matchId: match.id, kind: 'member', memberId: live.id, status: 'offered', offerExpiresAt: future },
    { matchId: anotherMatch.id, kind: 'member', memberId: live.id, status: 'offered', offerExpiresAt: future },
    { matchId: match.id, kind: 'member', memberId: expired.id, status: 'offered', offerExpiresAt: now },
    { matchId: match.id, kind: 'member', memberId: disabled.id, status: 'offered', offerExpiresAt: future },
  ]).returning()
  for (const member of [live, expired, disabled]) {
    await savePushSubscription(testDb, { ...subscription, memberId: member.id, endpoint: `https://push/${member.id}` })
  }
  const transport = transportOk()

  expect(await processDueNotifications(testDb, now, transport)).toEqual({ sent: 2 })
  expect(await processDueNotifications(testDb, now, transport)).toEqual({ sent: 0 })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(await testDb.select().from(notificationLog).orderBy(notificationLog.id)).toEqual(expect.arrayContaining(
    [firstOffer, secondOffer].map(({ id }) => expect.objectContaining({
      memberId: live.id, eventKey: `queue_offer:${id}`, sentAt: now,
    })),
  ))
  expect(await testDb.select().from(notificationLog)).toHaveLength(2)
})

it('scans bill_ready within 30 minutes of Jerusalem 09:00 on the first for the previous month', async () => {
  await matchFixture()
  const { member: active } = await createMember(testDb, { name: 'Ana' })
  const { member: disabled } = await createMember(testDb, { name: 'Ben' })
  await testDb.update(users).set({ status: 'disabled' }).where(eq(users.id, disabled.id))
  await savePushSubscription(testDb, { memberId: active.id, ...subscription })
  await savePushSubscription(testDb, { memberId: disabled.id, ...subscription, endpoint: 'https://push/2' })
  const transport = transportOk()

  for (const outside of ['2027-04-01T05:29:59.999Z', '2027-04-01T06:30:00.001Z', '2027-04-02T06:00:00.000Z']) {
    expect(await processDueNotifications(testDb, new Date(outside), transport)).toEqual({ sent: 0 })
  }
  expect(await testDb.select().from(notificationLog)).toEqual([])
  const opening = new Date('2027-04-01T05:30:00.000Z')
  const closing = new Date('2027-04-01T06:30:00.000Z')
  expect(await processDueNotifications(testDb, opening, transport)).toEqual({ sent: 1 })
  expect(await processDueNotifications(testDb, closing, transport)).toEqual({ sent: 0 })
  expect(transport).toHaveBeenCalledWith(
    expect.objectContaining({ memberId: active.id }),
    expect.objectContaining({ body: expect.stringContaining('2027-03'), url: '/bill' }),
  )
  await testDb.delete(notificationLog)
  expect(await processDueNotifications(testDb, closing, transport)).toEqual({ sent: 1 })
  expect(await testDb.select().from(notificationLog)).toMatchObject([
    { eventKey: 'bill_ready:2027-03', memberId: active.id, sentAt: closing },
  ])
})
