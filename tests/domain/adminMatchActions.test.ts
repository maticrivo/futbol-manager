import { eq } from 'drizzle-orm'
import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import {
  adminAddEntryAction,
  adminRemoveEntryAction,
  cancelMatchAction,
  recordGuestPaymentAction,
  refundGuestPaymentAction,
  restoreChargeAction,
  setAttendanceAction,
  updateMatchAction,
  waiveChargeAction,
} from '@/app/actions/admin'
import { charges, entries, guestPayments, matches } from '@/db/schema'
import { addGuest, signup } from '@/domain/entries'
import { lockMatch } from '@/domain/lock'
import { createMember } from '@/domain/members'
import { createMatchForDate, getMatch } from '@/domain/matches'
import { requireAdmin } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'admin.example', 'x-forwarded-proto': 'https' })),
}))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

it('updateMatchAction freezes money fields after lock and returns the code', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('matchId', String(match.id))
  form.set('costShekels', '40')
  expect(await updateMatchAction(null, form)).toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  expect(revalidatePath).not.toHaveBeenCalled()
})

it('adminAddEntryAction adds without a reason pre-lock and requires one when locked', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const player = (await createMember(testDb, { name: 'A' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const preLock = new FormData()
  preLock.set('matchId', String(match.id))
  preLock.set('memberId', String(player.id))
  preLock.set('reason', '')
  expect(await adminAddEntryAction(null, preLock)).toEqual({ ok: true })

  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  const player2 = (await createMember(testDb, { name: 'B' })).member
  const noReason = new FormData()
  noReason.set('matchId', String(match.id))
  noReason.set('memberId', String(player2.id))
  noReason.set('reason', '')
  expect(await adminAddEntryAction(null, noReason)).toEqual({ ok: false, code: 'INVALID_REASON' })

  const withReason = new FormData()
  withReason.set('matchId', String(match.id))
  withReason.set('memberId', String(player2.id))
  withReason.set('reason', 'replacement')
  expect(await adminAddEntryAction(null, withReason)).toEqual({ ok: true })
})

it('adminRemoveEntryAction removes and waives a locked charge', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const player = (await createMember(testDb, { name: 'A' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  const signed = await signup(testDb, { memberId: player.id, matchId: match.id, now: new Date('2027-03-27T10:00:00Z') })
  if (!signed.ok) throw new Error(signed.code)
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('matchId', String(match.id))
  form.set('entryId', String(signed.value.id))
  form.set('reason', 'dropped')
  expect(await adminRemoveEntryAction(null, form)).toEqual({ ok: true })

  const [charge] = await testDb.select().from(charges).where(eq(charges.memberId, player.id))
  expect(charge).toMatchObject({ status: 'waived', waiveReason: 'dropped' })
})

it('waiveChargeAction then restoreChargeAction', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const player = (await createMember(testDb, { name: 'A' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  await signup(testDb, { memberId: player.id, matchId: match.id, now: new Date('2027-03-27T10:00:00Z') })
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  const [charge] = await testDb.select().from(charges).where(eq(charges.memberId, player.id))
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const waive = new FormData()
  waive.set('matchId', String(match.id))
  waive.set('chargeId', String(charge.id))
  waive.set('reason', 'sub')
  expect(await waiveChargeAction(null, waive)).toEqual({ ok: true })

  const restore = new FormData()
  restore.set('matchId', String(match.id))
  restore.set('chargeId', String(charge.id))
  expect(await restoreChargeAction(null, restore)).toEqual({ ok: true })

  const [after] = await testDb.select().from(charges).where(eq(charges.id, charge.id))
  expect(after).toMatchObject({ status: 'charged', waivedBy: null, waiveReason: null })
})

it('setAttendanceAction marks present and absent', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const player = (await createMember(testDb, { name: 'A' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  const signed = await signup(testDb, { memberId: player.id, matchId: match.id, now: new Date('2027-03-27T10:00:00Z') })
  if (!signed.ok) throw new Error(signed.code)
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const present = new FormData()
  present.set('matchId', String(match.id))
  present.set('entryId', String(signed.value.id))
  present.set('attended', 'present')
  expect(await setAttendanceAction(null, present)).toEqual({ ok: true })

  const absent = new FormData()
  absent.set('matchId', String(match.id))
  absent.set('entryId', String(signed.value.id))
  absent.set('attended', 'absent')
  expect(await setAttendanceAction(null, absent)).toEqual({ ok: true })

  const [entry] = await testDb.select().from(entries).where(eq(entries.id, signed.value.id))
  expect(entry).toMatchObject({ attended: false })
})

it('recordGuestPaymentAction then refundGuestPaymentAction', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const host = (await createMember(testDb, { name: 'Host' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  const guest = await addGuest(testDb, { hostMemberId: host.id, matchId: match.id, name: 'Guest', now: new Date('2027-03-29T12:00:00Z') })
  if (!guest.ok) throw new Error(guest.code)
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const record = new FormData()
  record.set('matchId', String(match.id))
  record.set('entryId', String(guest.value.id))
  record.set('amountShekels', '35.5')
  record.set('note', 'cash')
  expect(await recordGuestPaymentAction(null, record)).toEqual({ ok: true })

  const [payment] = await testDb.select().from(guestPayments).where(eq(guestPayments.entryId, guest.value.id))
  expect(payment).toMatchObject({ kind: 'payment', amountAgorot: 3550 })

  const refund = new FormData()
  refund.set('matchId', String(match.id))
  refund.set('guestPaymentId', String(payment.id))
  expect(await refundGuestPaymentAction(null, refund)).toEqual({ ok: true })

  const rows = await testDb.select().from(guestPayments).where(eq(guestPayments.entryId, guest.value.id))
  expect(rows).toHaveLength(2)
  expect(rows[1]).toMatchObject({ kind: 'refund', amountAgorot: -3550, refundOfId: payment.id })
})

it('cancelMatchAction cancels with a reason', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('matchId', String(match.id))
  form.set('reason', 'weather')
  expect(await cancelMatchAction(null, form)).toEqual({ ok: true })
  expect(await getMatch(testDb, match.id)).toMatchObject({ status: 'cancelled' })
})

it('cancelMatchAction on a played match returns MATCH_FINISHED', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  await testDb.update(matches).set({ status: 'played' }).where(eq(matches.id, match.id))
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('matchId', String(match.id))
  form.set('reason', 'weather')
  expect(await cancelMatchAction(null, form)).toEqual({ ok: false, code: 'MATCH_FINISHED' })
  expect(revalidatePath).not.toHaveBeenCalled()
})

it('rejects a non-admin without mutating', async () => {
  const redirectError = new Error('NEXT_REDIRECT')
  vi.mocked(requireAdmin).mockRejectedValueOnce(redirectError)
  const form = new FormData()
  form.set('matchId', '1')
  form.set('reason', 'x')
  await expect(cancelMatchAction(null, form)).rejects.toThrow('NEXT_REDIRECT')
  expect(await testDb.select().from(matches)).toEqual([])
})

it('rejects an entry from another match before any mutation', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const player = (await createMember(testDb, { name: 'A' })).member
  const m1 = await createMatchForDate(testDb, '2027-03-30')
  const m2 = await createMatchForDate(testDb, '2027-04-06')
  const signed = await signup(testDb, { memberId: player.id, matchId: m1.id, now: new Date('2027-03-27T10:00:00Z') })
  if (!signed.ok) throw new Error(signed.code)
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('matchId', String(m2.id))
  form.set('entryId', String(signed.value.id))
  form.set('reason', 'x')
  expect(await adminRemoveEntryAction(null, form)).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(revalidatePath).not.toHaveBeenCalled()
  expect((await testDb.select().from(entries).where(eq(entries.id, signed.value.id)))[0].status).toBe('confirmed')
})

it('revalidates the dashboard, admin and match pages on success', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const match = await createMatchForDate(testDb, '2027-03-30')
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('matchId', String(match.id))
  form.set('venue', 'Park')
  expect(await updateMatchAction(null, form)).toEqual({ ok: true })
  expect(revalidatePath).toHaveBeenCalledWith('/')
  expect(revalidatePath).toHaveBeenCalledWith('/admin')
  expect(revalidatePath).toHaveBeenCalledWith(`/admin/matches/${match.id}`)
})
