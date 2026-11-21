'use client'

import { useTranslations } from 'next-intl'
import MatchActionForm from './MatchActionForm'

export default function MobileActionBar({
  canSignup,
  canWithdraw,
  matchId,
  entryId,
  spotsLeft,
}: {
  canSignup: boolean
  canWithdraw: boolean | object | null
  matchId: number
  entryId?: number | null
  spotsLeft: number
}) {
  const t = useTranslations('match')
  if (!canSignup && !canWithdraw) return null

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted">
          <span>{t('spotsLeft', { count: spotsLeft })}</span>
        </div>
        <div>
          {canSignup && <MatchActionForm key="mobile-signup" intent="signup" matchId={matchId} />}
          {canWithdraw && <MatchActionForm key="mobile-withdraw" intent="withdraw" matchId={matchId} entryId={entryId!} />}
        </div>
      </div>
    </div>
  )
}
