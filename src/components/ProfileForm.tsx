'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateOwnProfileAction } from '@/app/actions/profile'
import type { Member } from '@/domain/members'
import SubmitButton from './SubmitButton'
import { Field } from '@/components/ui/Field'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Avatar } from '@/components/ui/Avatar'

export default function ProfileForm({ member }: { member: Member }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateOwnProfileAction, null)

  return (
    <form action={formAction} className="space-y-4 text-start">
      <div className="flex items-center gap-4 pb-2">
        <Avatar name={member.name} src={member.image} size="xl" />
        <div>
          <p className="text-sm font-medium text-ink">{member.name}</p>
          <p className="text-xs text-muted">{member.email || ''}</p>
        </div>
      </div>

      <Field label={t('profile.name')} required>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={member.name ?? ''}
          dir="auto"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('profile.nickname')}>
        <input
          id="nickname"
          name="nickname"
          type="text"
          maxLength={60}
          defaultValue={member.nickname ?? ''}
          dir="auto"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('profile.email')} hint={t('profile.emailReadOnly')}>
        <p
          dir="ltr"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface-muted px-3.5 py-2.5 text-sm text-muted"
        >
          {member.email || '—'}
        </p>
      </Field>

      <Field label={t('profile.phone')}>
        <input
          id="phone"
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={member.phone ?? ''}
          dir="ltr"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </Field>

      <Field label={t('profile.image')} hint={t('profile.imageHint')}>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/*"
          dir="ltr"
          className="w-full text-sm text-ink file:me-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-soft file:text-primary hover:file:bg-primary/20"
        />
      </Field>

      <div className="pt-2">
        <SubmitButton
          label={t('profile.save')}
          pendingLabel={t('profile.saving')}
          primary
        />
      </div>

      {state?.ok === true && (
        <div aria-live="polite">
          <InlineMessage variant="success">
            {t('profile.saved')}
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
