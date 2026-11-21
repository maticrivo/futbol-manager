'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateMemberAction } from '@/app/actions/admin'
import type { Member } from '@/domain/members'
import SubmitButton from './SubmitButton'

export default function MemberEditForm({ member }: { member: Member }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateMemberAction, null)

  return (
    <form action={formAction} className="space-y-3 text-start">
      <input type="hidden" name="memberId" value={member.id} />

      <label className="block">
        <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('admin.members.name')}
        </span>
        <input
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={member.name}
          dir="auto"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('admin.members.nickname')}
        </span>
        <input
          name="nickname"
          type="text"
          maxLength={60}
          defaultValue={member.nickname ?? ''}
          dir="auto"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('admin.members.email')}
        </span>
        <input
          name="email"
          type="email"
          maxLength={254}
          defaultValue={member.email ?? ''}
          dir="ltr"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('admin.members.phone')}
        </span>
        <input
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={member.phone ?? ''}
          dir="ltr"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('admin.members.image')}
        </span>
        <input
          name="image"
          type="url"
          maxLength={500}
          defaultValue={member.image ?? ''}
          dir="ltr"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <div className="pt-1">
        <SubmitButton
          label={t('admin.members.save')}
          pendingLabel={t('admin.members.saving')}
          primary
        />
      </div>

      {state?.ok === true && (
        <div aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
          {t('admin.members.saved')}
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
