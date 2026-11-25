import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { charges } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { updateSettings } from '@/domain/settings'
import { requireMember } from '@/lib/auth'
import { billingMonthOf } from '@/lib/time'
import { testDb, resetDb } from '../db'

vi.mock('next-intl/server', () => {
  const t = Object.assign((key: string) => key, { rich: (key: string) => key })
  return { getTranslations: vi.fn(async () => t), getLocale: vi.fn(async () => 'en') }
})
vi.mock('@/lib/auth', () => ({ requireMember: vi.fn() }))
vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))
vi.mock('@/components/BillTable', () => ({ default: () => null }))

import BillPage from '@/app/bill/page'

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
})

async function signInMember(chargeAgorot?: number) {
  const member = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  if (chargeAgorot !== undefined) {
    const month = billingMonthOf(new Date())
    const match = await createMatchForDate(testDb, `${month}-15`)
    await testDb.insert(charges).values({ matchId: match.id, memberId: member.id, billingMonth: month, amountAgorot: chargeAgorot })
  }
  vi.mocked(requireMember).mockResolvedValue({ ...member, locale: 'en' } as never)
}

async function configurePaybox() {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  await updateSettings(testDb, admin.id, { payboxUrl: 'https://link.payboxapp.com/group' })
}

it('shows the Paybox link when a balance is due and a link is configured', async () => {
  await signInMember(3500)
  await configurePaybox()

  const html = renderToStaticMarkup(await BillPage())

  expect(html).toContain('href="https://link.payboxapp.com/group"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noopener noreferrer"')
})

it('hides the Paybox link when nothing is due', async () => {
  await signInMember()
  await configurePaybox()

  const html = renderToStaticMarkup(await BillPage())

  expect(html).not.toContain('link.payboxapp.com')
})

it('hides the Paybox link when no link is configured', async () => {
  await signInMember(3500)

  const html = renderToStaticMarkup(await BillPage())

  expect(html).not.toContain('payOnPaybox')
  expect(html).not.toContain('href=""')
})
