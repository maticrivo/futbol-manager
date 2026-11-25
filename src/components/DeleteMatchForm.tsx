'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { deleteMatchAction } from '@/app/actions/admin'
import { Button } from '@/components/ui/Button'

function DeleteSubmit() {
  const t = useTranslations()
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? t('admin.match.delete.submitting') : t('admin.match.delete.submit')}
    </Button>
  )
}

export default function DeleteMatchForm({ matchId, redirectTo }: { matchId: number; redirectTo?: string }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(deleteMatchAction, null)
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        {t('admin.match.delete.open')}
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <span className="text-sm font-medium text-danger">{t('admin.match.delete.confirm')}</span>
      <DeleteSubmit />
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t('common.cancel')}
      </Button>
      {state?.ok === false && (
        <span aria-live="polite" className="text-sm font-medium text-danger">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </span>
      )}
    </form>
  )
}
