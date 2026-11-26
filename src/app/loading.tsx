'use client'

import { useTranslations } from 'next-intl'
import { FootballSpinner } from '@/components/ui/FootballSpinner'

export default function Loading() {
  const t = useTranslations('common')
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full items-center justify-center px-4 pb-24 pt-10"
    >
      <FootballSpinner />
      <span className="sr-only">{t('loading')}</span>
    </main>
  )
}
