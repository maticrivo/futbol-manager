'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { savePrefsAction } from '@/app/actions/bill'
import type { NotificationCategory } from '@/domain/notifications'
import SubmitButton from './SubmitButton'
import { Card } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'

type Props = {
  categories: readonly NotificationCategory[]
  prefs: Record<NotificationCategory, boolean>
}

export default function NotificationPrefs({ categories, prefs }: Props) {
  const t = useTranslations()
  const [state, formAction] = useActionState(savePrefsAction, null)
  const error = state?.ok === false ? state.code : null

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">{t('notifications.title')}</h2>
        <p className="text-sm text-muted">{t('notifications.description')}</p>
      </div>
      <form action={formAction} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="sr-only">{t('notifications.title')}</legend>
          {categories.map(category => (
            <label key={category} className="flex items-center gap-3 cursor-pointer select-none text-sm text-ink py-1">
              <input type="checkbox" name={category} defaultChecked={prefs[category]} className="size-4 rounded border-line text-primary focus:ring-focus" />
              <span>{t(`notifications.categories.${category}`)}</span>
            </label>
          ))}
        </fieldset>
        <div className="pt-2">
          <SubmitButton label={t('notifications.save')} pendingLabel={t('notifications.saving')} primary />
        </div>
        <div aria-live="polite">
          {error !== null && (
            <InlineMessage variant="danger">
              {t.has('errors.' + error) ? t('errors.' + error) : t('errors.UNKNOWN')}
            </InlineMessage>
          )}
        </div>
        {state?.ok === true && (
          <div aria-live="polite">
            <InlineMessage variant="success">
              {t('notifications.saved')}
            </InlineMessage>
          </div>
        )}
      </form>
    </Card>
  )
}
