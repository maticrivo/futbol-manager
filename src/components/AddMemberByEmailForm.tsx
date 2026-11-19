'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { addMemberAction } from '@/app/actions/admin'
import { LOCALES, LOCALE_LABELS } from '@/i18n/locale'
import InviteLink from './InviteLink'
import SubmitButton from './SubmitButton'

export default function AddMemberByEmailForm() {
  const t = useTranslations()
  const [state, formAction] = useActionState(addMemberAction, null)

  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('admin.members.addTitle')}</h2>
      {state?.ok && <InviteLink url={state.inviteUrl} />}
      <form action={formAction} className="space-y-3">
        <label className="block">
          <span className="block text-sm font-medium">{t('admin.members.emailOrName')}</span>
          <input
            name="email"
            dir="auto"
            required
            maxLength={120}
            placeholder={t('auth.emailPlaceholder')}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="block text-sm font-medium">{t('admin.members.role')}</span>
            <select name="role" className="mt-1 w-full rounded border px-3 py-2">
              <option value="member">{t('admin.members.roleMember')}</option>
              <option value="admin">{t('admin.members.roleAdmin')}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium">{t('admin.members.status')}</span>
            <select name="status" className="mt-1 w-full rounded border px-3 py-2">
              <option value="active">{t('admin.members.statusActive')}</option>
              <option value="pending">{t('admin.members.statusPending')}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium">{t('admin.members.locale')}</span>
            <select name="locale" className="mt-1 w-full rounded border px-3 py-2">
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_LABELS[locale]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <SubmitButton label={t('admin.members.add')} pendingLabel={t('admin.members.adding')} primary />
        {state?.ok === false && (
          <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </div>
        )}
      </form>
    </section>
  )
}
