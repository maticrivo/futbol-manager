'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { openSignupsNowAction, updateMatchAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

function OpenSignupsForm({ matchId }: { matchId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(openSignupsNowAction, null)

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="matchId" value={matchId} />
      <Button type="submit" variant="outline" size="sm">
        {t('admin.match.edit.openSignupsNow')}
      </Button>
      {state?.ok === false && (
        <span aria-live="polite" className="ms-2 text-sm font-medium text-danger">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </span>
      )}
    </form>
  )
}

export default function EditMatchForm({
  matchId,
  venue,
  venueUrl,
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
  venueUrl: string
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
    <Card variant="default" padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-ink">{t('admin.match.edit.title')}</h2>
        {showOpenSignups && <OpenSignupsForm matchId={matchId} />}
      </div>
      {locked && (
        <p className="text-sm text-muted">{t('admin.match.edit.locked')}</p>
      )}
      {finished && (
        <p className="text-sm text-muted">{t('admin.match.edit.finished')}</p>
      )}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="matchId" value={matchId} />

        <Field label={t('admin.match.edit.venue')}>
          <input
            name="venue" dir="auto" maxLength={120} defaultValue={venue} disabled={finished}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.venueUrl')} hint={t('admin.match.edit.venueUrlHint')}>
          <input
            name="venueUrl" type="url" inputMode="url" dir="ltr" maxLength={500}
            defaultValue={venueUrl} disabled={finished} placeholder="https://maps.app.goo.gl/..."
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.kickoffAt')}>
          <input
            name="kickoffAt" type="datetime-local" defaultValue={kickoffAt} disabled={finished}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.costShekels')}>
          <input
            name="costShekels" inputMode="decimal" defaultValue={costShekels}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.capacity')}>
          <input
            name="capacity" type="number" min={1} max={40} defaultValue={capacity}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.signupOpensAt')}>
          <input
            name="signupOpensAt" type="datetime-local" defaultValue={signupOpensAt}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.guestPhaseAt')}>
          <input
            name="guestPhaseAt" type="datetime-local" defaultValue={guestPhaseAt}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.lockAt')}>
          <input
            name="lockAt" type="datetime-local" defaultValue={lockAt}
            readOnly={moneyDisabled} disabled={moneyDisabled}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        <Field label={t('admin.match.edit.notes')}>
          <textarea
            name="notes" dir="auto" rows={3} maxLength={2000} defaultValue={notes} disabled={finished}
            className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          />
        </Field>

        {!finished && <SubmitButton label={t('admin.match.edit.save')} pendingLabel={t('admin.match.edit.saving')} primary />}
        {state?.ok === true && (
          <div aria-live="polite" className="text-sm font-medium text-primary">
            {t('admin.match.edit.saved')}
          </div>
        )}
        {state?.ok === false && (
          <div aria-live="polite" className="text-sm font-medium text-danger">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </div>
        )}
      </form>
    </Card>
  )
}
