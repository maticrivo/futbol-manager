'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateMemberAction } from '@/app/actions/admin'
import type { Member } from '@/domain/members'
import SubmitButton from './SubmitButton'
import { Field } from './ui/Field'
import { Avatar } from './ui/Avatar'

export default function MemberEditForm({ member }: { member: Member }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateMemberAction, null)

  return (
    <form action={formAction} className="space-y-3 text-start">
      <input type="hidden" name="memberId" value={member.id} />

      <div className="flex items-center gap-3 pb-1">
        <Avatar name={member.name} src={member.image} size="md" />
        <span className="text-xs font-medium text-muted">{member.email || ''}</span>
      </div>

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

      <Field label={t('admin.members.email')} hint={t('admin.members.emailReadOnly')}>
        <p
          dir="ltr"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface-muted px-3 py-2 text-sm text-muted"
        >
          {member.email || '—'}
        </p>
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
          type="file"
          accept="image/*"
          dir="ltr"
          className="w-full text-xs text-ink file:me-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary-soft file:text-primary hover:file:bg-primary/20"
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
