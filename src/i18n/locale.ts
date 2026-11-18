export const LOCALES = ['he', 'en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const LOCALE_COOKIE = 'locale'
export const LOCALE_LABELS: Record<Locale, string> = {
  he: 'עברית',
  en: 'English',
  es: 'Español',
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

export function resolveLocale(cookie?: string, acceptLanguage?: string): Locale {
  const preferred = cookie?.toLowerCase()
  if (isLocale(preferred)) return preferred

  for (const range of acceptLanguage?.split(',') ?? []) {
    const language = range.split(';')[0].trim().split('-')[0].toLowerCase()
    if (isLocale(language)) return language
  }

  return 'en'
}
