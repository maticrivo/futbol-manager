import { expect, it } from 'vitest'
import { viewportForTheme } from '@/lib/viewport'

const zoomLock = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
} as const

it('locks zoom in every theme', () => {
  for (const theme of ['system', 'light', 'dark'] as const) {
    expect(viewportForTheme(theme)).toMatchObject(zoomLock)
  }
})

it('keeps the existing theme colors beside the zoom lock', () => {
  expect(viewportForTheme('light').themeColor).toBe('#f6f5f2')
  expect(viewportForTheme('dark').themeColor).toBe('#101412')
  expect(viewportForTheme('system').themeColor).toEqual([
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#101412' },
  ])
})
