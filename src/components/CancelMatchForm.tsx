'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { cancelMatchAction } from '@/app/actions/admin'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm font-medium text-danger">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

function CancelSubmit({ disabled }: { disabled: boolean }) {
  const t = useTranslations()
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant="danger"
      size="md"
      disabled={disabled || pending}
    >
      {pending ? t('admin.match.cancel.submitting') : t('admin.match.cancel.submit')}
    </Button>
  )
}

function CancelForm({ matchId }: { matchId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(cancelMatchAction, null)
  const [confirmed, setConfirmed] = useState(false)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="matchId" value={matchId} />
      <Field label={t('admin.match.cancel.reason')}>
        <textarea
          name="reason" dir="auto" required maxLength={255} rows={3}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          className="h-4 w-4 rounded border-line text-primary focus:ring-focus"
        />
        <span className="text-sm text-ink font-medium">{t('admin.match.cancel.confirm')}</span>
      </label>
      <CancelSubmit disabled={!confirmed} />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

export default function CancelMatchForm({ matchId, state }: {
  matchId: number
  state: 'open' | 'cancelled' | 'played'
}) {
  const t = useTranslations()

  return (
    <Card variant="danger" padding="lg" className="space-y-4 border-danger/30">
      <h2 className="text-xl font-semibold text-danger">{t('admin.match.cancel.title')}</h2>
      {state === 'open' ? (
        <CancelForm matchId={matchId} />
      ) : (
        <p className="text-sm text-muted">
          {state === 'played' ? t('admin.match.cancel.finished') : t('admin.match.cancel.disabled')}
        </p>
      )}
    </Card>
  )
}
