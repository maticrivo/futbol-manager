'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { recordGuestPaymentAction, refundGuestPaymentAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
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
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="entryId" value={entryId} />
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.match.guests.amount')}</span>
        <input
          name="amountShekels" inputMode="decimal" required defaultValue={costShekels}
          className="mt-1 rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.match.guests.note')}</span>
        <input name="note" dir="auto" className="mt-1 rounded border px-3 py-2" />
      </label>
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
      <SubmitButton label={t('admin.match.guests.refund')} pendingLabel={t('admin.match.guests.refunding')} />
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
    <li className="space-y-2 rounded border p-3">
      <div>
        <bdi>{name}</bdi>
        {hostName && (
          <span className="ms-2 text-sm">{t('admin.match.roster.guestOfLabel')} <bdi>{hostName}</bdi></span>
        )}
      </div>

      {!disabled && <RecordPayment matchId={matchId} entryId={entryId} costShekels={costShekels} />}

      <div className="text-sm">
        <p className="font-medium">{t('admin.match.guests.history')}</p>
        {payments.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-300">{t('admin.match.guests.noPayments')}</p>
        ) : (
          <ul className="space-y-1">
            {payments.map(payment => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <bdi>{payment.amount}</bdi>
                  {payment.kind === 'refund' && (
                    <span className="ms-2 text-neutral-500 dark:text-neutral-400">{t('admin.match.guests.refunded')}</span>
                  )}
                  {payment.note && <span className="ms-2 text-neutral-500 dark:text-neutral-400"><bdi>{payment.note}</bdi></span>}
                </span>
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
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('admin.match.guests.title')}</h2>
      {disabled && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.guests.disabled')}</p>
      )}
      {guests.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-300">{t('admin.match.guests.empty')}</p>
      ) : (
        <ul className="space-y-2">
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
    </section>
  )
}
