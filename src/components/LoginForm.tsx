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
