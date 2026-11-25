'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { recordPaymentAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'
import { Field } from './ui/Field'

export default function PaymentForm({
  memberId,
  defaultAmountShekels,
}: {
  memberId: string
  defaultAmountShekels?: string
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(recordPaymentAction, null)

  return (
    <form action={formAction} className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
      <input type="hidden" name="memberId" value={memberId} />
      <Field label={t('admin.money.amount')} required>
        <input
          name="amountShekels"
          inputMode="decimal"
          required
          defaultValue={defaultAmountShekels}
          placeholder="0.00"
          className="h-10 w-full sm:w-28 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>
      <Field label={t('admin.money.methodLabel')}>
        <select name="method" defaultValue="cash" className="h-10 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <option value="paybox">{t('admin.money.method.paybox')}</option>
          <option value="cash">{t('admin.money.method.cash')}</option>
          <option value="other">{t('admin.money.method.other')}</option>
        </select>
      </Field>
      <Field label={t('admin.money.note')}>
        <input name="note" dir="auto" maxLength={255} className="h-10 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
      </Field>
      <Field label={t('admin.money.targetMonth')}>
        <input type="month" name="targetMonth" className="h-10 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
      </Field>
      <div className="pt-1">
        <SubmitButton label={t('admin.money.submit')} pendingLabel={t('admin.money.saving')} primary />
      </div>
      {state?.ok === false && (
        <div aria-live="polite" className="w-full text-sm text-danger">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </div>
      )}
    </form>
  )
}
