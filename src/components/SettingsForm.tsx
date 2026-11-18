'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateSettingsAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

export default function SettingsForm({
  capacity,
  costShekels,
  venue,
  kickoffTime,
  queueWindowMinutes,
}: {
  capacity: number
  costShekels: string
  venue: string
  kickoffTime: string
  queueWindowMinutes: number
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateSettingsAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.settings.capacity')}</span>
        <input
          name="capacity"
          type="number"
          min={1}
          max={40}
          required
          defaultValue={capacity}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.settings.costShekels')}</span>
        <input
          name="costShekels"
          inputMode="decimal"
          required
          defaultValue={costShekels}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.settings.venue')}</span>
        <input
          name="venue"
          dir="auto"
          maxLength={120}
          defaultValue={venue}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.settings.kickoffTime')}</span>
        <input
          name="kickoffTime"
          type="time"
          required
          defaultValue={kickoffTime}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.settings.queueWindowMinutes')}</span>
        <input
          name="queueWindowMinutes"
          type="number"
          min={5}
          max={1440}
          required
          defaultValue={queueWindowMinutes}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <SubmitButton label={t('admin.settings.save')} pendingLabel={t('admin.settings.saving')} primary />
      {state?.ok === true && (
        <div aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
          {t('admin.settings.saved')}
        </div>
      )}
      {state?.ok === false && (
        <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </div>
      )}
    </form>
  )
}
