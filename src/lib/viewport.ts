import type { Viewport } from 'next'
import type { Theme } from '@/lib/theme'

const ZOOM_LOCK = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
} as const

export function viewportForTheme(theme: Theme): Viewport {
  if (theme === 'light') {
    return { ...ZOOM_LOCK, themeColor: '#f6f5f2' }
  }
  if (theme === 'dark') {
    return { ...ZOOM_LOCK, themeColor: '#101412' }
  }
  return {
    ...ZOOM_LOCK,
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
      { media: '(prefers-color-scheme: dark)', color: '#101412' },
    ],
  }
}
