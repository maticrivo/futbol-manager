'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { requestMagicLinkAction } from '@/app/actions/auth'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { InlineMessage } from '@/components/ui/InlineMessage'

export default function LoginForm() {
  const t = useTranslations('auth')
  const [state, formAction, isPending] = useActionState(requestMagicLinkAction, null)

  return (
    <div className="space-y-4">
      {state?.ok ? (
        <InlineMessage role="status" variant="success" title={t('magicLinkSent')} />
      ) : (
        <form action={formAction} className="space-y-4">
          <Field label={t('emailLabel')} required>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoFocus
              placeholder={t('emailPlaceholder')}
              className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </Field>

          <details className="rounded-[var(--radius-md)] border border-line p-3.5 text-start bg-surface-muted">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              {t('detailsSummary')}
            </summary>
            <div className="mt-3.5 space-y-3.5">
              <Field label={t('nameLabel')}>
                <input
                  id="name"
                  type="text"
                  name="name"
                  maxLength={120}
                  dir="auto"
                  className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
                />
              </Field>

              <Field label={t('nicknameLabel')}>
                <input
                  id="nickname"
                  type="text"
                  name="nickname"
                  maxLength={60}
                  dir="auto"
                  className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
                />
              </Field>

              <Field label={t('phoneLabel')}>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  maxLength={40}
                  dir="ltr"
                  className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
                />
              </Field>

              <Field label={t('imageLabel')}>
                <input
                  id="image"
                  type="url"
                  name="image"
                  maxLength={500}
                  dir="ltr"
                  className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
                />
              </Field>
            </div>
          </details>

          {state && !state.ok && (
            <div aria-live="polite">
              <InlineMessage variant="danger">
                {t('magicLinkError')}
              </InlineMessage>
            </div>
          )}

          <Button
            type="submit"
            isLoading={isPending}
            variant="primary"
            className="w-full"
          >
            {isPending ? t('sendingLink') : t('sendLink')}
          </Button>
        </form>
      )}
    </div>
  )
}
