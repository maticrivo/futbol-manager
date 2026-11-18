'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { savePrefsAction } from '@/app/actions/bill'
import type { NotificationCategory } from '@/domain/notifications'
import SubmitButton from './SubmitButton'

type Props = {
  categories: readonly NotificationCategory[]
  prefs: Record<NotificationCategory, boolean>
}

export default function NotificationPrefs({ categories, prefs }: Props) {
  const t = useTranslations()
  const [state, formAction] = useActionState(savePrefsAction, null)
  const error = state?.ok === false ? state.code : null

  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">{t('notifications.title')}</h2>
      <p className="text-sm">{t('notifications.description')}</p>
      <form action={formAction} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('notifications.title')}</legend>
          {categories.map(category => (
            <label key={category} className="flex items-center gap-2">
              <input type="checkbox" name={category} defaultChecked={prefs[category]} className="size-4" />
              <span>{t(`notifications.categories.${category}`)}</span>
            </label>
          ))}
        </fieldset>
        <SubmitButton label={t('notifications.save')} pendingLabel={t('notifications.saving')} primary />
        <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
          {error !== null && (t.has('errors.' + error) ? t('errors.' + error) : t('errors.UNKNOWN'))}
        </div>
        {state?.ok === true && (
          <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">{t('notifications.saved')}</p>
        )}
      </form>
    </section>
  )
}
