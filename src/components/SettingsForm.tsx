'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateSettingsAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'
import { Field } from '@/components/ui/Field'
import { InlineMessage } from '@/components/ui/InlineMessage'

export default function SettingsForm({
  capacity,
  costShekels,
  venue,
  venueUrl,
  kickoffTime,
  queueWindowMinutes,
}: {
  capacity: number
  costShekels: string
  venue: string
  venueUrl: string
  kickoffTime: string
  queueWindowMinutes: number
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateSettingsAction, null)

  return (
    <form action={formAction} className="space-y-4 text-start">
      <Field label={t('admin.settings.capacity')} required>
        <input
          name="capacity"
          type="number"
          min={1}
          max={40}
          required
          defaultValue={capacity}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('admin.settings.costShekels')} required>
        <input
          name="costShekels"
          inputMode="decimal"
          required
          defaultValue={costShekels}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('admin.settings.venue')}>
        <input
          name="venue"
          dir="auto"
          maxLength={160}
          defaultValue={venue}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('admin.settings.venueUrl')} hint={t('admin.settings.venueUrlHint')}>
        <input
          name="venueUrl"
          type="url"
          inputMode="url"
          dir="ltr"
          maxLength={500}
          defaultValue={venueUrl}
          placeholder="https://maps.app.goo.gl/..."
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('admin.settings.kickoffTime')} required>
        <input
          name="kickoffTime"
          type="time"
          required
          defaultValue={kickoffTime}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('admin.settings.queueWindowMinutes')} required>
        <input
          name="queueWindowMinutes"
          type="number"
          min={5}
          max={1440}
          required
          defaultValue={queueWindowMinutes}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <div className="pt-2">
        <SubmitButton label={t('admin.settings.save')} pendingLabel={t('admin.settings.saving')} primary />
      </div>

      {state?.ok === true && (
        <div aria-live="polite">
          <InlineMessage variant="success">
            {t('admin.settings.saved')}
          </InlineMessage>
        </div>
      )}

      {state?.ok === false && (
        <div aria-live="polite">
          <InlineMessage variant="danger">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </InlineMessage>
        </div>
      )}
    </form>
  )
}
