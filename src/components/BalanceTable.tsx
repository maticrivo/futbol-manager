'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { recordPaymentAction, sendReminderAction } from '@/app/actions/admin'
import PaymentForm from './PaymentForm'
import SubmitButton from './SubmitButton'

export type BalanceRow = {
  id: number
  name: string
  balanceAgorot: number
  balanceLabel: string
  credit: boolean
}

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  if (code === null) return null
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
      {t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN')}
    </div>
  )
}

function MemberRow({ row }: { row: BalanceRow }) {
  const t = useTranslations()
  const [markState, markAction] = useActionState(recordPaymentAction, null)
  const [reminderState, reminderAction] = useActionState(sendReminderAction, null)
  const owes = row.balanceAgorot > 0

  return (
    <tr className="border-t">
      <td className="py-2 align-top"><bdi>{row.name}</bdi></td>
      <td className="py-2 align-top">{!row.credit && <bdi>{row.balanceLabel}</bdi>}</td>
      <td className="py-2 align-top">{row.credit && <bdi>{row.balanceLabel}</bdi>}</td>
      <td className="py-2 align-top">
        <div className="flex flex-wrap items-center gap-2">
          {owes && (
            <form action={markAction}>
              <input type="hidden" name="memberId" value={row.id} />
              <input type="hidden" name="amountShekels" value={(row.balanceAgorot / 100).toFixed(2)} />
              <input type="hidden" name="method" value="cash" />
              <SubmitButton label={t('admin.money.markPaid')} pendingLabel={t('admin.money.working')} />
            </form>
          )}
          <PaymentForm memberId={row.id} />
          {owes && (
            <form action={reminderAction}>
              <input type="hidden" name="memberId" value={row.id} />
              <SubmitButton label={t('admin.money.sendReminder')} pendingLabel={t('admin.money.sending')} />
            </form>
          )}
        </div>
        <ActionError code={markState?.ok === false ? markState.code : null} />
        <ActionError code={reminderState?.ok === false ? reminderState.code : null} />
        {reminderState?.ok === true && (
          <div aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
            {t('admin.money.reminderSent')}
          </div>
        )}
      </td>
    </tr>
  )
}

export default function BalanceTable({ rows }: { rows: BalanceRow[] }) {
  const t = useTranslations()
  if (rows.length === 0) {
    return <p className="text-neutral-600 dark:text-neutral-300">{t('admin.money.empty')}</p>
  }
  return (
    <section className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="px-4 py-2 text-start font-medium">{t('admin.money.member')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('admin.money.balance')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('admin.money.credit')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('admin.money.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <MemberRow key={row.id} row={row} />)}
        </tbody>
      </table>
    </section>
  )
}
