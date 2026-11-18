import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE, resolveLocale } from '@/i18n/locale'

export default getRequestConfig(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()])
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    requestHeaders.get('accept-language') ?? undefined
  )
  const messages = (await import(`../../messages/${locale}.json`)).default
  return { locale, messages }
})
