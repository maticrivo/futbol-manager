'use client'

import { useLocale } from 'next-intl'
import { setLocaleAction } from '@/app/actions/auth'
import { LOCALES, LOCALE_LABELS } from '@/i18n/locale'

export default function LocaleSwitcher() {
  const currentLocale = useLocale()

  return (
    <div className="flex flex-wrap gap-2">
      {LOCALES.map((locale) => (
        <form action={setLocaleAction} key={locale}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            lang={locale}
            dir="auto"
            aria-pressed={locale === currentLocale}
            className="cursor-pointer rounded border border-line bg-surface px-2 py-1 text-xs font-medium text-ink aria-pressed:font-semibold aria-pressed:border-primary"
          >
            {LOCALE_LABELS[locale]}
          </button>
        </form>
      ))}
    </div>
  )
}
