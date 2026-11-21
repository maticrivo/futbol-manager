import { getLocale, getTranslations } from 'next-intl/server'
import { formatMatchDate, formatMoney } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

type PaymentMethod = 'paybox' | 'cash' | 'other'

export type BillChargeRow = {
  id: number
  matchDate: string
  kickoffAt: string
  amountAgorot: number
  waived: boolean
}

export type BillPaymentRow = {
  id: number
  paidAt: string
  method: PaymentMethod
  amountAgorot: number
  note: string | null
}

export default async function BillTable({
  charges, payments, moneyLocale,
}: { charges: BillChargeRow[]; payments: BillPaymentRow[]; moneyLocale: string }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('bill')])
  const methodLabels: Record<PaymentMethod, string> = {
    paybox: t('method.paybox'),
    cash: t('method.cash'),
    other: t('method.other'),
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="text-xl font-semibold text-ink">{t('charges')}</h2>
        {charges.length === 0 ? (
          <EmptyState icon="receipt" title={t('chargesEmpty')} className="border-0 p-6 bg-surface-muted" />
        ) : (
          <ul className="divide-y divide-line">
            {charges.map(charge => (
              <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <bdi className="text-sm font-medium text-ink">
                  <time dateTime={charge.kickoffAt}>
                    {formatMatchDate(new Date(charge.kickoffAt), locale)}
                  </time>
                </bdi>
                <span className="flex items-center gap-2.5">
                  {charge.waived && (
                    <Badge variant="secondary" size="sm">{t('waived')}</Badge>
                  )}
                  <bdi className="text-sm font-semibold text-ink">{formatMoney(charge.amountAgorot, moneyLocale)}</bdi>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-xl font-semibold text-ink">{t('payments')}</h2>
        {payments.length === 0 ? (
          <EmptyState icon="credit-card" title={t('paymentsEmpty')} className="border-0 p-6 bg-surface-muted" />
        ) : (
          <ul className="divide-y divide-line">
            {payments.map(payment => (
              <li key={payment.id} className="space-y-1.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <bdi className="text-sm font-medium text-ink">
                    <time dateTime={payment.paidAt}>
                      {formatMatchDate(new Date(payment.paidAt), locale)}
                    </time>
                  </bdi>
                  <span className="flex items-center gap-2.5">
                    <Badge variant="outline" size="sm">{methodLabels[payment.method]}</Badge>
                    <bdi className="text-sm font-semibold text-ink">{formatMoney(payment.amountAgorot, moneyLocale)}</bdi>
                  </span>
                </div>
                {payment.note && <p className="text-xs text-muted"><bdi>{payment.note}</bdi></p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
