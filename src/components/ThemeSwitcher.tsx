'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { THEMES, THEME_COOKIE, type Theme } from '@/lib/theme'

const LABEL_KEYS: Record<Theme, string> = {
  system: 'profile.themeSystem',
  light: 'profile.themeLight',
  dark: 'profile.themeDark',
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

function persistTheme(theme: Theme) {
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${oneYear}; samesite=lax`
}

export default function ThemeSwitcher({ initialTheme }: { initialTheme: Theme }) {
  const t = useTranslations()
  const [theme, setTheme] = useState<Theme>(initialTheme)

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next)
    persistTheme(next)
  }

  return (
    <div role="group" aria-label={t('profile.theme')} className="flex flex-wrap gap-2">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          aria-pressed={theme === option}
          className="cursor-pointer rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {t(LABEL_KEYS[option])}
        </button>
      ))}
    </div>
  )
}
