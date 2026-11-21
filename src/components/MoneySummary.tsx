'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { setExpenseAction } from '@/app/actions/admin'
import { formatMoney } from '@/lib/time'
import SubmitButton from './SubmitButton'
import { Card } from './ui/Card'
import { Stat } from './ui/Stat'
import { Field } from './ui/Field'

export default function MoneySummary({
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

  const items = [
    [t('admin.money.charges'), chargesAgorot, 'receipt'],
    [t('admin.money.memberCollected'), memberCollectedAgorot, 'users'],
    [t('admin.money.guestCollected'), guestCollectedAgorot, 'userPlus'],
    [t('admin.money.expense'), expenseAgorot, 'card'],
    [t('admin.money.pot'), differenceAgorot, 'wallet'],
    [t('admin.money.outstanding'), outstandingAgorot, 'alert'],
  ] as const

  return (
    <Card variant="default" padding="lg" className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(([label, agorot, icon]) => (
          <Stat
            key={label}
            label={label}
            value={formatMoney(agorot, locale)}
            icon={icon}
          />
        ))}
      </div>

      <form action={formAction} className="space-y-4 pt-4 border-t border-line">
        <Field label={t('admin.money.expenseLabel')}>
          <input
            name="fieldCostShekels"
            inputMode="decimal"
            required
            defaultValue={(expenseAgorot / 100).toFixed(2)}
            className="h-11 w-full sm:w-48 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </Field>
        <div>
          <SubmitButton label={t('admin.money.expenseSave')} pendingLabel={t('admin.money.expenseSaving')} primary />
        </div>
        {state?.ok === true && (
          <div aria-live="polite" className="text-sm text-primary">
            {t('admin.money.expenseSaved')}
          </div>
        )}
        {state?.ok === false && (
          <div aria-live="polite" className="text-sm text-danger">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </div>
        )}
      </form>
    </Card>
  )
}
