'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { recordPaymentAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

export default function PaymentForm({
  memberId,
  defaultAmountShekels,
}: {
  memberId: number
  defaultAmountShekels?: string
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(recordPaymentAction, null)

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.money.amount')}</span>
        <input
          name="amountShekels"
          inputMode="decimal"
          required
          defaultValue={defaultAmountShekels}
          placeholder="0.00"
          className="mt-1 w-24 rounded border px-2 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.money.methodLabel')}</span>
        <select name="method" defaultValue="cash" className="mt-1 rounded border px-2 py-2">
          <option value="paybox">{t('admin.money.method.paybox')}</option>
          <option value="cash">{t('admin.money.method.cash')}</option>
          <option value="other">{t('admin.money.method.other')}</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.money.note')}</span>
        <input name="note" dir="auto" maxLength={255} className="mt-1 rounded border px-2 py-2" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.money.targetMonth')}</span>
        <input type="month" name="targetMonth" className="mt-1 rounded border px-2 py-2" />
      </label>
      <SubmitButton label={t('admin.money.submit')} pendingLabel={t('admin.money.saving')} primary />
      {state?.ok === false && (
        <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </div>
      )}
    </form>
  )
}
