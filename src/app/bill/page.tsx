import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import BillTable, { type BillChargeRow, type BillPaymentRow } from '@/components/BillTable'
import NotificationPrefs from '@/components/NotificationPrefs'
import { getDb } from '@/db'
import { memberBalance, memberBill } from '@/domain/billing'
import { listNotificationPrefs, NOTIFICATION_CATEGORIES } from '@/domain/notifications'
import { requireMember } from '@/lib/auth'
import { billingMonthOf, formatMoney } from '@/lib/time'

export default async function BillPage() {
  const member = await requireMember()
  const db = getDb()
  const now = new Date()
  const month = billingMonthOf(now)
  const [bill, balance, prefs, locale, t] = await Promise.all([
    memberBill(db, member.id, month),
    memberBalance(db, member.id),
    listNotificationPrefs(db, member.id),
    getLocale(),
    getTranslations('bill'),
  ])

  const chargeRows: BillChargeRow[] = bill.charges.map(({ id, matchDate, amountAgorot, status }) => ({
    id, matchDate, amountAgorot, waived: status !== 'charged',
  }))
  const paymentRows: BillPaymentRow[] = bill.allocations.map(({ payment, amountAgorot }) => ({
    id: payment.id, paidAt: payment.paidAt.toISOString(), method: payment.method, amountAgorot, note: payment.note,
  }))
  const bidi = (chunks: ReactNode) => <bdi>{chunks}</bdi>

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <section className="space-y-2 rounded-xl border p-5">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {t.rich('month', { month, bidi })}
        </p>
        <p className="text-lg font-medium">
          {bill.dueAgorot === 0
            ? t('settled')
            : t.rich('due', { amount: formatMoney(bill.dueAgorot, locale), bidi })}
        </p>
        <p>
          {balance.balanceAgorot < 0
            ? t.rich('credit', { amount: formatMoney(Math.abs(balance.balanceAgorot), locale), bidi })
            : t.rich('balance', { amount: formatMoney(balance.balanceAgorot, locale), bidi })}
        </p>
      </section>
      <BillTable charges={chargeRows} payments={paymentRows} />
      <NotificationPrefs categories={NOTIFICATION_CATEGORIES} prefs={prefs} />
    </main>
  )
}
