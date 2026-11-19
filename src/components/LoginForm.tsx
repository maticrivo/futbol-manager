'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { requestMagicLinkAction } from '@/app/actions/auth'

export default function LoginForm() {
  const t = useTranslations('auth')
  const [state, formAction, isPending] = useActionState(requestMagicLinkAction, null)

  return (
    <div className="space-y-4">
      {state?.ok ? (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300"
        >
          <p className="font-medium">{t('magicLinkSent')}</p>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium">
              {t('emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoFocus
              placeholder={t('emailPlaceholder')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>

          {state && !state.ok && (
            <div aria-live="polite" className="text-sm text-red-600 dark:text-red-400">
              {t('magicLinkError')}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full cursor-pointer rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-500"
          >
            {isPending ? t('sendingLink') : t('sendLink')}
          </button>
        </form>
      )}
    </div>
  )
}
