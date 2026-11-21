'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateOwnProfileAction } from '@/app/actions/profile'
import type { Member } from '@/domain/members'
import SubmitButton from './SubmitButton'

export default function ProfileForm({ member }: { member: Member }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateOwnProfileAction, null)

  return (
    <form action={formAction} className="space-y-4 text-start">
      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium">
          {t('profile.name')}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={member.name ?? ''}
          dir="auto"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="nickname" className="block text-sm font-medium">
          {t('profile.nickname')}
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          maxLength={60}
          defaultValue={member.nickname ?? ''}
          dir="auto"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          {t('profile.email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={254}
          defaultValue={member.email ?? ''}
          dir="ltr"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="block text-sm font-medium">
          {t('profile.phone')}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={member.phone ?? ''}
          dir="ltr"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="image" className="block text-sm font-medium">
          {t('profile.image')}
        </label>
        <input
          id="image"
          name="image"
          type="url"
          maxLength={500}
          defaultValue={member.image ?? ''}
          dir="ltr"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('profile.imageHint')}
        </p>
      </div>

      <div className="pt-2">
        <SubmitButton
          label={t('profile.save')}
          pendingLabel={t('profile.saving')}
          primary
        />
      </div>

      {state?.ok === true && (
        <div aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
          {t('profile.saved')}
        </div>
      )}

      {state?.ok === false && (
        <div aria-live="polite" className="text-sm text-red-600 dark:text-red-400">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </div>
      )}
    </form>
  )
}
