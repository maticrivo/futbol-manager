import { expect, it } from 'vitest'
import { isTheme, parseTheme, THEMES } from '@/lib/theme'

it('accepts the three theme values and falls back to system', () => {
  expect(THEMES).toEqual(['system', 'light', 'dark'])
  expect(isTheme('dark')).toBe(true)
  expect(isTheme('light')).toBe(true)
  expect(isTheme('system')).toBe(true)
  expect(isTheme('sepia')).toBe(false)
  expect(parseTheme('dark')).toBe('dark')
  expect(parseTheme(undefined)).toBe('system')
  expect(parseTheme('nope')).toBe('system')
})
