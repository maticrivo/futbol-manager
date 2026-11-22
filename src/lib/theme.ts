export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_COOKIE = 'theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme)
}

export function parseTheme(value: unknown): Theme {
  return isTheme(value) ? value : 'system'
}
