'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { cancelMatchAction } from '@/app/actions/admin'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

function CancelSubmit({ disabled }: { disabled: boolean }) {
  const t = useTranslations()
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="cursor-pointer rounded-md border border-red-700 bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t('admin.match.cancel.submitting') : t('admin.match.cancel.submit')}
    </button>
  )
}

function CancelForm({ matchId }: { matchId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(cancelMatchAction, null)
  const [confirmed, setConfirmed] = useState(false)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="matchId" value={matchId} />
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.match.cancel.reason')}</span>
        <textarea
          name="reason" dir="auto" required maxLength={255} rows={2}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
        />
        <span className="text-sm">{t('admin.match.cancel.confirm')}</span>
      </label>
      <CancelSubmit disabled={!confirmed} />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

export default function CancelMatchForm({ matchId, disabled }: { matchId: number; disabled: boolean }) {
  const t = useTranslations()

  return (
    <section className="space-y-3 rounded-xl border border-red-300 p-5">
      <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">{t('admin.match.cancel.title')}</h2>
      {disabled ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.cancel.disabled')}</p>
      ) : (
        <CancelForm matchId={matchId} />
      )}
    </section>
  )
}
