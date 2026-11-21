'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { recordGuestPaymentAction, refundGuestPaymentAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm font-medium text-danger">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

export type GuestPaymentRow = {
  id: number
  kind: 'payment' | 'refund'
  amount: string
  note: string | null
  refunded: boolean
}

export type GuestRow = {
  entryId: number
  name: string
  hostName: string | null
  payments: GuestPaymentRow[]
}

function RecordPayment({ matchId, entryId, costShekels }: {
  matchId: number
  entryId: number
  costShekels: string
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(recordGuestPaymentAction, null)
  return (
    <form action={formAction} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-2">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="entryId" value={entryId} />
      <Field label={t('admin.match.guests.amount')} className="w-full sm:w-36">
        <input
          name="amountShekels" inputMode="decimal" required defaultValue={costShekels}
          className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>
      <Field label={t('admin.match.guests.note')} className="flex-1">
        <input name="note" dir="auto" className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
      </Field>
      <SubmitButton label={t('admin.match.guests.record')} pendingLabel={t('admin.match.guests.recording')} primary />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

function RefundPayment({ matchId, guestPaymentId }: { matchId: number; guestPaymentId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(refundGuestPaymentAction, null)
  return (
    <form action={formAction}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="guestPaymentId" value={guestPaymentId} />
      <Button type="submit" variant="outline" size="sm">
        {t('admin.match.guests.refund')}
      </Button>
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

function GuestRow({ matchId, entryId, name, hostName, costShekels, payments, disabled }: {
  matchId: number
  entryId: number
  name: string
  hostName: string | null
  costShekels: string
  payments: GuestPaymentRow[]
  disabled: boolean
}) {
  const t = useTranslations()

  return (
    <li className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-subtle">
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink">
          <bdi>{name}</bdi>
        </span>
        <Badge variant="secondary" size="sm">Guest</Badge>
        {hostName && (
          <span className="text-xs text-muted">
            {t('admin.match.roster.guestOfLabel')} <bdi>{hostName}</bdi>
          </span>
        )}
      </div>

      {!disabled && <RecordPayment matchId={matchId} entryId={entryId} costShekels={costShekels} />}

      <div className="space-y-2 pt-2 border-t border-line text-sm">
        <p className="font-medium text-ink">{t('admin.match.guests.history')}</p>
        {payments.length === 0 ? (
          <p className="text-muted">{t('admin.match.guests.noPayments')}</p>
        ) : (
          <ul className="space-y-2">
            {payments.map(payment => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-2.5 border border-line">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">
                    <bdi>{payment.amount}</bdi>
                  </span>
                  {payment.kind === 'refund' && (
                    <Badge variant="secondary" size="sm">{t('admin.match.guests.refunded')}</Badge>
                  )}
                  {payment.note && <span className="text-muted"><bdi>{payment.note}</bdi></span>}
                </div>
                {payment.kind === 'payment' && !payment.refunded && !disabled && (
                  <RefundPayment matchId={matchId} guestPaymentId={payment.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export default function GuestPayments({ matchId, costShekels, guests, disabled }: {
  matchId: number
  costShekels: string
  guests: GuestRow[]
  disabled: boolean
}) {
  const t = useTranslations()

  return (
    <Card variant="default" padding="lg" className="space-y-4">
      <h2 className="text-xl font-semibold text-ink">{t('admin.match.guests.title')}</h2>
      {disabled && (
        <p className="text-sm text-muted">{t('admin.match.guests.disabled')}</p>
      )}
      {guests.length === 0 ? (
        <p className="text-muted">{t('admin.match.guests.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {guests.map(guest => (
            <GuestRow
              key={guest.entryId}
              matchId={matchId}
              entryId={guest.entryId}
              name={guest.name}
              hostName={guest.hostName}
              costShekels={costShekels}
              payments={guest.payments}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
