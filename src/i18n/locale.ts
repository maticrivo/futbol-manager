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
    const [tag, ...params] = range.split(';')
    const trimmedTag = tag.trim()
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(trimmedTag)) continue

    const excludesRange = params.some((param) => {
      const trimmedParam = param.trim()
      if (!/^q(?:\s|=|$)/i.test(trimmedParam)) return false
      const quality = /^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i.exec(trimmedParam)
      return !quality || Number(quality[1]) === 0
    })
    if (excludesRange) continue

    const language = trimmedTag.split('-')[0].toLowerCase()
    if (isLocale(language)) return language
  }

  return 'en'
}
