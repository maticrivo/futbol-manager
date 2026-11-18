import { getLocale } from 'next-intl/server'
import { setLocaleAction } from '@/app/actions/auth'
import { LOCALES, LOCALE_LABELS } from '@/i18n/locale'

export default async function LocaleSwitcher() {
  const currentLocale = await getLocale()

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
            className="cursor-pointer rounded border px-2 py-1 aria-pressed:font-semibold"
          >
            {LOCALE_LABELS[locale]}
          </button>
        </form>
      ))}
    </div>
  )
}
