'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { setExpenseAction } from '@/app/actions/admin'
import { formatMoney } from '@/lib/time'
import SubmitButton from './SubmitButton'

export default function MoneySummary({
  month,
  chargesAgorot,
  memberCollectedAgorot,
  guestCollectedAgorot,
  expenseAgorot,
  differenceAgorot,
  outstandingAgorot,
  locale,
}: {
  month: string
  chargesAgorot: number
  memberCollectedAgorot: number
  guestCollectedAgorot: number
  expenseAgorot: number
  differenceAgorot: number
  outstandingAgorot: number
  locale: string
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(setExpenseAction, null)

  const rows = [
    [t('admin.money.charges'), chargesAgorot],
    [t('admin.money.memberCollected'), memberCollectedAgorot],
    [t('admin.money.guestCollected'), guestCollectedAgorot],
    [t('admin.money.expense'), expenseAgorot],
    [t('admin.money.pot'), differenceAgorot],
    [t('admin.money.outstanding'), outstandingAgorot],
  ] as const

  return (
    <section className="space-y-4 rounded-xl border p-5">
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([label, agorot]) => (
          <div key={label} className="rounded border p-3">
            <dt className="text-sm text-neutral-600 dark:text-neutral-300">{label}</dt>
            <dd className="text-lg font-semibold"><bdi>{formatMoney(agorot, locale)}</bdi></dd>
          </div>
        ))}
      </dl>

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="month" value={month} />
        <label className="block">
          <span className="block text-sm font-medium">{t('admin.money.expenseLabel')}</span>
          <input
            name="fieldCostShekels"
            inputMode="decimal"
            required
            defaultValue={(expenseAgorot / 100).toFixed(2)}
            className="mt-1 w-40 rounded border px-3 py-2"
          />
        </label>
        <SubmitButton label={t('admin.money.expenseSave')} pendingLabel={t('admin.money.expenseSaving')} primary />
        {state?.ok === true && (
          <div aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
            {t('admin.money.expenseSaved')}
          </div>
        )}
        {state?.ok === false && (
          <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </div>
        )}
      </form>
    </section>
  )
}
