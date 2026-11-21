'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateOwnProfileAction } from '@/app/actions/profile'
import type { Member } from '@/domain/members'
import SubmitButton from './SubmitButton'
import { Field } from '@/components/ui/Field'
import { InlineMessage } from '@/components/ui/InlineMessage'

export default function ProfileForm({ member }: { member: Member }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(updateOwnProfileAction, null)

  return (
    <form action={formAction} className="space-y-4 text-start">
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

      <Field label={t('profile.email')}>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={254}
          defaultValue={member.email ?? ''}
          dir="ltr"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
        />
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
          type="url"
          maxLength={500}
          defaultValue={member.image ?? ''}
          dir="ltr"
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
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
