import type { MetadataRoute } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { isLocale, type Locale } from '@/i18n/locale'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [requestedLocale, t] = await Promise.all([getLocale(), getTranslations('common')])
  const locale: Locale = isLocale(requestedLocale) ? requestedLocale : 'en'
  const appName = t('appName')

  return {
    name: appName,
    short_name: appName,
    start_url: '/',
    display: 'standalone',
    background_color: '#12301c',
    theme_color: '#12301c',
    lang: locale,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
    ],
  }
}
