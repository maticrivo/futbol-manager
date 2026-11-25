'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { recordPaymentAction, sendReminderAction } from '@/app/actions/admin'
import PaymentForm from './PaymentForm'
import SubmitButton from './SubmitButton'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

export type BalanceRow = {
  id: string
  name: string
  balanceAgorot: number
  balanceLabel: string
  credit: boolean
}

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  if (code === null) return null
  return (
    <div aria-live="polite" className="text-sm text-danger mt-1">
      {t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN')}
    </div>
  )
}

function MemberCard({ row }: { row: BalanceRow }) {
  const t = useTranslations()
  const [markState, markAction] = useActionState(recordPaymentAction, null)
  const [reminderState, reminderAction] = useActionState(sendReminderAction, null)
  const [showPayment, setShowPayment] = useState(false)
  const owes = row.balanceAgorot > 0

  return (
    <Card variant="default" padding="md" className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <span className="font-semibold text-lg text-ink"><bdi>{row.name}</bdi></span>
        </div>
        <div>
          {row.credit ? (
            <Badge variant="success" size="md">
              Credit: <bdi>{row.balanceLabel}</bdi>
            </Badge>
          ) : owes ? (
            <Badge variant="danger" size="md">
              Owes: <bdi>{row.balanceLabel}</bdi>
            </Badge>
          ) : (
            <Badge variant="secondary" size="md">
              Settled
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
        {owes && (
          <form action={markAction}>
            <input type="hidden" name="memberId" value={row.id} />
            <input type="hidden" name="amountShekels" value={(row.balanceAgorot / 100).toFixed(2)} />
            <input type="hidden" name="method" value="cash" />
            <SubmitButton label={t('admin.money.markPaid')} pendingLabel={t('admin.money.working')} />
          </form>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPayment(!showPayment)}
        >
          {showPayment ? 'Close Payment' : t('admin.money.submit')}
        </Button>
        {owes && (
          <form action={reminderAction}>
            <input type="hidden" name="memberId" value={row.id} />
            <SubmitButton label={t('admin.money.sendReminder')} pendingLabel={t('admin.money.sending')} />
          </form>
        )}
      </div>

      {showPayment && (
        <div className="pt-3 border-t border-line bg-surface-muted p-3 rounded-[var(--radius-md)]">
          <PaymentForm memberId={row.id} />
        </div>
      )}

      <ActionError code={markState?.ok === false ? markState.code : null} />
      <ActionError code={reminderState?.ok === false ? reminderState.code : null} />
      {reminderState?.ok === true && (
        <div aria-live="polite" className="text-sm text-primary">
          {t('admin.money.reminderSent')}
        </div>
      )}
    </Card>
  )
}

export default function BalanceTable({ rows }: { rows: BalanceRow[] }) {
  const t = useTranslations()
  if (rows.length === 0) {
    return <p className="text-muted">{t('admin.money.empty')}</p>
  }
  return (
    <section className="space-y-3">
      {rows.map(row => <MemberCard key={row.id} row={row} />)}
    </section>
  )
}
