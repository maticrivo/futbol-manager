import { beforeEach, expect, it, vi } from 'vitest'
import { notificationPrefs } from '@/db/schema'
import { createMember } from '@/domain/members'
import { savePushSubscription, sendPaymentReminder } from '@/domain/notifications'
import { testDb, resetDb } from '../db'

beforeEach(resetDb)

const now = new Date('2027-03-28T12:00:00.000Z')
const subscription = { endpoint: 'https://push/1', p256dh: 'k', auth: 'a' }

async function adminAndMember() {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const member = (await createMember(testDb, { name: 'Ana' })).member
  return { admin, member }
}

it('lets an admin send a reminder but never a member', async () => {
  const { admin, member } = await adminAndMember()
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })
  expect(await sendPaymentReminder(testDb, { actorId: member.id, memberId: member.id, now }, transport)).toEqual({ ok: false, code: 'FORBIDDEN' })
  const ok = await sendPaymentReminder(testDb, { actorId: admin.id, memberId: member.id, now }, transport)
  expect(ok.ok).toBe(true)
})

it('sends a reminder each minute but dedupes a repeat within the same minute', async () => {
  const { admin, member } = await adminAndMember()
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })

  expect(await sendPaymentReminder(testDb, { actorId: admin.id, memberId: member.id, now }, transport))
    .toEqual({ ok: true, value: { sent: true } })
  expect(await sendPaymentReminder(testDb, { actorId: admin.id, memberId: member.id, now: new Date(now.getTime() + 60_000) }, transport))
    .toEqual({ ok: true, value: { sent: true } })
  expect(transport).toHaveBeenCalledTimes(2)

  // A second trigger in the same minute deduplicates and does not call the transport.
  expect(await sendPaymentReminder(testDb, { actorId: admin.id, memberId: member.id, now: new Date(now.getTime() + 60_000) }, transport))
    .toEqual({ ok: true, value: { sent: false } })
  expect(transport).toHaveBeenCalledTimes(2)
})

it('rejects a non-admin actor, a missing actor, and a missing target', async () => {
  const { admin, member } = await adminAndMember()
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })

  expect(await sendPaymentReminder(testDb, { actorId: member.id, memberId: member.id, now }, transport))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await sendPaymentReminder(testDb, { actorId: 999999, memberId: member.id, now }, transport))
    .toEqual({ ok: false, code: 'FORBIDDEN' })
  expect(await sendPaymentReminder(testDb, { actorId: admin.id, memberId: 999999, now }, transport))
    .toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(transport).not.toHaveBeenCalled()
})

it('does not send when the member opted out of payment reminders', async () => {
  const { admin, member } = await adminAndMember()
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  await testDb.insert(notificationPrefs).values({ memberId: member.id, category: 'payment_reminder', enabled: false })
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })

  expect(await sendPaymentReminder(testDb, { actorId: admin.id, memberId: member.id, now }, transport))
    .toEqual({ ok: true, value: { sent: false } })
  expect(transport).not.toHaveBeenCalled()
})
