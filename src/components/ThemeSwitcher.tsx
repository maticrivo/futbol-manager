import { getTranslations } from 'next-intl/server'
import { setThemeAction } from '@/app/actions/theme'
import { THEMES, type Theme } from '@/lib/theme'

const LABEL_KEYS: Record<Theme, string> = {
  system: 'profile.themeSystem',
  light: 'profile.themeLight',
  dark: 'profile.themeDark',
}

export default async function ThemeSwitcher({ currentTheme }: { currentTheme: Theme }) {
  const t = await getTranslations()

  return (
    <div role="group" aria-label={t('profile.theme')} className="flex flex-wrap gap-2">
      {THEMES.map((option) => (
        <form action={setThemeAction} key={option}>
          <input type="hidden" name="theme" value={option} />
          <button
            type="submit"
            aria-pressed={currentTheme === option}
            className="cursor-pointer rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {t(LABEL_KEYS[option])}
          </button>
        </form>
      ))}
    </div>
  )
}
