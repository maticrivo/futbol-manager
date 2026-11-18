import { getLocale, getTranslations } from 'next-intl/server'
import { formatMatchDate, formatMoney } from '@/lib/time'

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
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{t('charges')}</h2>
        {charges.length === 0 ? (
          <p>{t('chargesEmpty')}</p>
        ) : (
          <ul className="divide-y">
            {charges.map(charge => (
              <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <bdi>
                  <time dateTime={charge.kickoffAt}>
                    {formatMatchDate(new Date(charge.kickoffAt), locale)}
                  </time>
                </bdi>
                <span className="flex items-center gap-2">
                  {charge.waived && (
                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{t('waived')}</span>
                  )}
                  <bdi>{formatMoney(charge.amountAgorot, moneyLocale)}</bdi>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{t('payments')}</h2>
        {payments.length === 0 ? (
          <p>{t('paymentsEmpty')}</p>
        ) : (
          <ul className="divide-y">
            {payments.map(payment => (
              <li key={payment.id} className="space-y-1 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <bdi>
                    <time dateTime={payment.paidAt}>
                      {formatMatchDate(new Date(payment.paidAt), locale)}
                    </time>
                  </bdi>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{methodLabels[payment.method]}</span>
                    <bdi>{formatMoney(payment.amountAgorot, moneyLocale)}</bdi>
                  </span>
                </div>
                {payment.note && <p className="text-sm text-neutral-600 dark:text-neutral-300"><bdi>{payment.note}</bdi></p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
