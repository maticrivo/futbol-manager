import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { recordPaymentAction, sendReminderAction, setExpenseAction } from '@/app/actions/admin'
import { charges, paymentAllocations, payments } from '@/db/schema'
import { memberBalance, monthSummary } from '@/domain/billing'
import { createMember } from '@/domain/members'
import { createMatchForDate } from '@/domain/matches'
import { savePushSubscription } from '@/domain/notifications'
import { requireAdmin } from '@/lib/auth'
import { defaultTransport } from '@/lib/push'
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
vi.mock('@/lib/push', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/push')>()
  return { ...actual, defaultTransport: vi.fn().mockResolvedValue({ statusCode: 201 }) }
})

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

async function addCharge(memberId: number, month: string, amountAgorot: number) {
  const match = await createMatchForDate(testDb, `${month}-12`)
  await testDb.insert(charges).values({ matchId: match.id, memberId, billingMonth: month, amountAgorot })
}

function paymentForm(memberId: number, overrides: Record<string, string> = {}) {
  const data = new FormData()
  data.set('memberId', String(memberId))
  data.set('amountShekels', '35.5')
  data.set('method', 'paybox')
  for (const [key, value] of Object.entries(overrides)) data.set(key, value)
  return data
}

function allocations() {
  return testDb.select({ billingMonth: paymentAllocations.billingMonth, amountAgorot: paymentAllocations.amountAgorot })
    .from(paymentAllocations).orderBy(paymentAllocations.id)
}

it('converts shekels to agorot and allocates oldest-first across two months', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const member = (await createMember(testDb, { name: 'Ana' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)
  await addCharge(member.id, '2027-01', 3500)
  await addCharge(member.id, '2027-02', 7000)

  expect(await recordPaymentAction(null, paymentForm(member.id))).toEqual({ ok: true })

  expect(await allocations()).toEqual([
    { billingMonth: '2027-01', amountAgorot: 3500 },
    { billingMonth: '2027-02', amountAgorot: 50 },
  ])
  expect((await memberBalance(testDb, member.id)).balanceAgorot).toBe(6950)
  expect(revalidatePath).toHaveBeenCalledWith('/admin/money')
  expect(revalidatePath).toHaveBeenCalledWith('/admin')
})

it('rejects zero, malformed and negative amounts without writing a payment', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const member = (await createMember(testDb, { name: 'Ana' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await recordPaymentAction(null, paymentForm(member.id, { amountShekels: '0' })))
    .toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await recordPaymentAction(null, paymentForm(member.id, { amountShekels: 'abc' })))
    .toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await recordPaymentAction(null, paymentForm(member.id, { amountShekels: '-5' })))
    .toEqual({ ok: false, code: 'INVALID_AMOUNT' })

  expect(await testDb.select().from(payments)).toEqual([])
  expect(revalidatePath).not.toHaveBeenCalled()
})

it('respects a target month over older debt', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const member = (await createMember(testDb, { name: 'Ana' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)
  await addCharge(member.id, '2027-01', 3500)
  await addCharge(member.id, '2027-02', 3500)

  expect(await recordPaymentAction(null, paymentForm(member.id, { amountShekels: '35', targetMonth: '2027-02' })))
    .toEqual({ ok: true })

  expect(await allocations()).toEqual([{ billingMonth: '2027-02', amountAgorot: 3500 }])
})

it('persists the field rent and rejects malformed values', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = (overrides: Record<string, string> = {}) => {
    const data = new FormData()
    data.set('month', '2027-03')
    data.set('fieldCostShekels', '200')
    for (const [key, value] of Object.entries(overrides)) data.set(key, value)
    return data
  }

  expect(await setExpenseAction(null, form())).toEqual({ ok: true })
  expect((await monthSummary(testDb, '2027-03')).expenseAgorot).toBe(20000)
  expect(revalidatePath).toHaveBeenCalledWith('/admin/money')
  expect(revalidatePath).toHaveBeenCalledWith('/admin')

  const before = await monthSummary(testDb, '2027-03')
  expect(await setExpenseAction(null, form({ month: '2027-13' }))).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await setExpenseAction(null, form({ fieldCostShekels: 'abc' }))).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
  expect(await monthSummary(testDb, '2027-03')).toEqual(before)
})

it('sends a reminder and revalidates on success', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const member = (await createMember(testDb, { name: 'Ana' })).member
  await savePushSubscription(testDb, { memberId: member.id, endpoint: 'https://push/1', p256dh: 'k', auth: 'a' })
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const data = new FormData()
  data.set('memberId', String(member.id))
  expect(await sendReminderAction(null, data)).toEqual({ ok: true })
  expect(revalidatePath).toHaveBeenCalledWith('/admin/money')
  expect(defaultTransport).toHaveBeenCalledTimes(1)
})

it('maps FORBIDDEN and NOT_FOUND without sending', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const nonAdmin = (await createMember(testDb, { name: 'Ana' })).member

  vi.mocked(requireAdmin).mockResolvedValue(nonAdmin)
  const self = new FormData()
  self.set('memberId', String(nonAdmin.id))
  expect(await sendReminderAction(null, self)).toEqual({ ok: false, code: 'FORBIDDEN' })

  vi.mocked(requireAdmin).mockResolvedValue(admin)
  const missing = new FormData()
  missing.set('memberId', '999999')
  expect(await sendReminderAction(null, missing)).toEqual({ ok: false, code: 'NOT_FOUND' })

  expect(defaultTransport).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})
