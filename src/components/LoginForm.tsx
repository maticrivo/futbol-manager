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

          <details className="rounded-md border border-gray-200 p-3 text-start dark:border-gray-800">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('detailsSummary')}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <label htmlFor="name" className="block text-sm font-medium">
                  {t('nameLabel')}
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  maxLength={120}
                  dir="auto"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="nickname" className="block text-sm font-medium">
                  {t('nicknameLabel')}
                </label>
                <input
                  id="nickname"
                  type="text"
                  name="nickname"
                  maxLength={60}
                  dir="auto"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="phone" className="block text-sm font-medium">
                  {t('phoneLabel')}
                </label>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  maxLength={40}
                  dir="ltr"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="image" className="block text-sm font-medium">
                  {t('imageLabel')}
                </label>
                <input
                  id="image"
                  type="url"
                  name="image"
                  maxLength={500}
                  dir="ltr"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
            </div>
          </details>

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
