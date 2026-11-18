import { expect, it } from 'vitest'
import { resolveLocale } from '@/i18n/locale'

it('prefers the cookie, then Accept-Language, then English', () => {
  expect(resolveLocale('he', 'en-US,en;q=0.9')).toBe('he')
  expect(resolveLocale(undefined, 'es-AR,es;q=0.9,en;q=0.8')).toBe('es')
  expect(resolveLocale(undefined, 'he-IL,he;q=0.9')).toBe('he')
  expect(resolveLocale(undefined, 'fr-FR,fr;q=0.9')).toBe('en')
  expect(resolveLocale('xx', undefined)).toBe('en')
  expect(resolveLocale('HE', undefined)).toBe('he')
  expect(resolveLocale(undefined, undefined)).toBe('en')
})
