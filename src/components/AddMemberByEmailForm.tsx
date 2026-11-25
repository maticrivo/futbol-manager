'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { addMemberAction } from '@/app/actions/admin'
import { LOCALES, LOCALE_LABELS } from '@/i18n/locale'
import SubmitButton from './SubmitButton'
import { Card } from './ui/Card'
import { Field } from './ui/Field'

export default function AddMemberByEmailForm() {
  const t = useTranslations()
  const [state, formAction] = useActionState(addMemberAction, null)

  return (
    <Card variant="default" padding="lg" className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">{t('admin.members.addTitle')}</h2>
      {state?.ok && (
        <div aria-live="polite" className="text-sm text-primary">
          {t('admin.members.created')}
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <Field label={t('admin.members.email')} required>
          <input
            name="email"
            type="email"
            dir="ltr"
            required
            maxLength={254}
            placeholder={t('auth.emailPlaceholder')}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('admin.members.role')}>
            <select name="role" className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              <option value="member">{t('admin.members.roleMember')}</option>
              <option value="admin">{t('admin.members.roleAdmin')}</option>
            </select>
          </Field>
          <Field label={t('admin.members.status')}>
            <select name="status" className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              <option value="active">{t('admin.members.statusActive')}</option>
              <option value="pending">{t('admin.members.statusPending')}</option>
            </select>
          </Field>
          <Field label={t('admin.members.locale')}>
            <select name="locale" className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_LABELS[locale]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="pt-2">
          <SubmitButton label={t('admin.members.add')} pendingLabel={t('admin.members.adding')} primary />
        </div>
        {state?.ok === false && (
          <div aria-live="polite" className="text-sm text-danger">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </div>
        )}
      </form>
    </Card>
  )
}
