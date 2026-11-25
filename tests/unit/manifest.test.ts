import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  getTranslations: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getLocale: mocks.getLocale,
  getTranslations: mocks.getTranslations,
}))

import manifest from '@/app/manifest'

function messagesFor(locale: string) {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
}

async function manifestFor(locale: string) {
  const messages = messagesFor(locale)
  mocks.getLocale.mockResolvedValue(locale)
  mocks.getTranslations.mockResolvedValue((key: string) => messages.common[key])
  return manifest()
}

describe('web app manifest', () => {
  it.each(['en', 'he', 'es'])('uses the %s app name for the icon label', async (locale) => {
    const messages = messagesFor(locale)
    const result = await manifestFor(locale)

    expect(result.name).toBe(messages.common.appName)
    expect(result.short_name).toBe(messages.common.appName)
  })

  it.each(['en', 'he', 'es'])('declares %s as the manifest language', async (locale) => {
    const result = await manifestFor(locale)

    expect(result.lang).toBe(locale)
  })

  it('keeps the installable app configuration', async () => {
    const result = await manifestFor('en')

    expect(result.start_url).toBe('/')
    expect(result.display).toBe('standalone')
    expect(result.icons?.length).toBeGreaterThanOrEqual(2)
    expect(result.icons?.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })
})
