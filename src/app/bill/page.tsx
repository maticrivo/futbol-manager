import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import BillTable, { type BillChargeRow, type BillPaymentRow } from '@/components/BillTable'
import { getDb } from '@/db'
import { memberBalance, memberBill } from '@/domain/billing'
import { requireMember } from '@/lib/auth'
import { billingMonthOf, formatMoney } from '@/lib/time'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default async function BillPage() {
  const member = await requireMember()
  const db = getDb()
  const now = new Date()
  const month = billingMonthOf(now)
  const [bill, balance, t] = await Promise.all([
    memberBill(db, member.id, month),
    memberBalance(db, member.id),
    getTranslations('bill'),
  ])

  const chargeRows: BillChargeRow[] = bill.charges.map(({ id, matchDate, kickoffAt, amountAgorot, status }) => ({
    id, matchDate, kickoffAt: kickoffAt.toISOString(), amountAgorot, waived: status !== 'charged',
  }))
  const paymentRows: BillPaymentRow[] = bill.allocations.map(({ payment, amountAgorot }) => ({
    id: payment.id, paidAt: payment.paidAt.toISOString(), method: payment.method, amountAgorot, note: payment.note,
  }))
  const bidi = (chunks: ReactNode) => <bdi>{chunks}</bdi>

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 pb-28 md:pb-8 text-start">
      <PageHeader title={t('title')} subtitle={t.rich('month', { month, bidi })} />
      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted">{t('charges')}</span>
          {bill.dueAgorot <= 0 ? (
            <Badge variant="success">{t('settled')}</Badge>
          ) : (
            <Badge variant="warning">
              {t.rich('due', { amount: formatMoney(bill.dueAgorot, member.locale), bidi })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2 border-t border-line">
          <div className="text-2xl font-bold text-ink">
            {bill.dueAgorot <= 0
              ? t('settled')
              : t.rich('due', { amount: formatMoney(bill.dueAgorot, member.locale), bidi })}
          </div>
          <div className="text-sm text-muted">
            {balance.balanceAgorot < 0
              ? t.rich('credit', { amount: formatMoney(Math.abs(balance.balanceAgorot), member.locale), bidi })
              : t.rich('balance', { amount: formatMoney(balance.balanceAgorot, member.locale), bidi })}
          </div>
        </div>
      </Card>
      <BillTable charges={chargeRows} payments={paymentRows} moneyLocale={member.locale} />
    </main>
  )
}
