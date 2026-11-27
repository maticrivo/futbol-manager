'use client'

import { useTranslations } from 'next-intl'
import type { AnswerAction } from '@/lib/answers'
import AnswerActions from './AnswerActions'

export default function MobileActionBar({
  actions,
  matchId,
  entryId,
  spotsLeft,
}: {
  actions: AnswerAction[]
  matchId: number
  entryId?: number | null
  spotsLeft: number
}) {
  const t = useTranslations('match')
  if (actions.length === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        {/* The label wraps so two actions still fit at phone width in every locale. */}
        <div className="min-w-0 text-xs font-medium text-muted">
          <span>{t('spotsLeft', { count: spotsLeft })}</span>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <AnswerActions actions={actions} matchId={matchId} entryId={entryId} prefix="mobile" />
        </div>
      </div>
    </div>
  )
}
