'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateMemberAction } from '@/app/actions/admin'
import type { Member } from '@/domain/members'
import SubmitButton from './SubmitButton'
import { Field } from './ui/Field'

export default function MemberEditForm({ member }: { member: Member }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateMemberAction, null)

  return (
    <form action={formAction} className="space-y-3 text-start">
      <input type="hidden" name="memberId" value={member.id} />

      <Field label={t('admin.members.name')} required>
        <input
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={member.name}
          dir="auto"
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>

      <Field label={t('admin.members.nickname')}>
        <input
          name="nickname"
          type="text"
          maxLength={60}
          defaultValue={member.nickname ?? ''}
          dir="auto"
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>

      <Field label={t('admin.members.email')}>
        <input
          name="email"
          type="email"
          maxLength={254}
          defaultValue={member.email ?? ''}
          dir="ltr"
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>

      <Field label={t('admin.members.phone')}>
        <input
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={member.phone ?? ''}
          dir="ltr"
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>

      <Field label={t('admin.members.image')}>
        <input
          name="image"
          type="url"
          maxLength={500}
          defaultValue={member.image ?? ''}
          dir="ltr"
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>

      <div className="pt-1">
        <SubmitButton
          label={t('admin.members.save')}
          pendingLabel={t('admin.members.saving')}
          primary
        />
      </div>

      {state?.ok === true && (
        <div aria-live="polite" className="text-sm text-primary">
          {t('admin.members.saved')}
        </div>
      )}

      {state?.ok === false && (
        <div aria-live="polite" className="text-sm text-danger">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </div>
      )}
    </form>
  )
}
