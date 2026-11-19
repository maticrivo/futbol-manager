'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { openSignupsNowAction, updateMatchAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

function OpenSignupsForm({ matchId }: { matchId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(openSignupsNowAction, null)

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="matchId" value={matchId} />
      <SubmitButton
        label={t('admin.match.edit.openSignupsNow')}
        pendingLabel={t('admin.match.edit.openingSignupsNow')}
      />
      {state?.ok === false && (
        <span aria-live="polite" className="ms-2 text-sm text-red-700 dark:text-red-300">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </span>
      )}
    </form>
  )
}

export default function EditMatchForm({
  matchId,
  venue,
  notes,
  capacity,
  costShekels,
  kickoffAt,
  signupOpensAt,
  guestPhaseAt,
  lockAt,
  locked,
  finished,
  canOpenSignups,
}: {
  matchId: number
  venue: string
  notes: string
  capacity: number
  costShekels: string
  kickoffAt: string
  signupOpensAt: string
  guestPhaseAt: string
  lockAt: string
  locked: boolean
  finished: boolean
  canOpenSignups?: boolean
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateMatchAction, null)
  const moneyDisabled = locked || finished
  const showOpenSignups = canOpenSignups ?? (!locked && !finished)

  return (
    <section className="space-y-3 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('admin.match.edit.title')}</h2>
        {showOpenSignups && <OpenSignupsForm matchId={matchId} />}
      </div>
      {locked && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.edit.locked')}</p>
      )}
      {finished && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.edit.finished')}</p>
      )}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="matchId" value={matchId} />

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.venue')}</span>
          <input
            name="venue" dir="auto" maxLength={120} defaultValue={venue} disabled={finished}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.kickoffAt')}</span>
          <input
            name="kickoffAt" type="datetime-local" defaultValue={kickoffAt} disabled={finished}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.costShekels')}</span>
          <input
            name="costShekels" inputMode="decimal" defaultValue={costShekels}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.capacity')}</span>
          <input
            name="capacity" type="number" min={1} max={40} defaultValue={capacity}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.signupOpensAt')}</span>
          <input
            name="signupOpensAt" type="datetime-local" defaultValue={signupOpensAt}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.guestPhaseAt')}</span>
          <input
            name="guestPhaseAt" type="datetime-local" defaultValue={guestPhaseAt}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.lockAt')}</span>
          <input
            name="lockAt" type="datetime-local" defaultValue={lockAt}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">{t('admin.match.edit.notes')}</span>
          <textarea
            name="notes" dir="auto" rows={3} maxLength={2000} defaultValue={notes} disabled={finished}
            className="mt-1 w-full rounded border px-3 py-2 disabled:opacity-60"
          />
        </label>

        {!finished && <SubmitButton label={t('admin.match.edit.save')} pendingLabel={t('admin.match.edit.saving')} primary />}
        {state?.ok === true && (
          <div aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
            {t('admin.match.edit.saved')}
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
