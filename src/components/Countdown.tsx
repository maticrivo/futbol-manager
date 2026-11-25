'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { countdownParts, latestPassedBoundary, nextTransition, shouldRequestRefresh } from '@/lib/countdown'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/icons'

export default function Countdown({
  renderedAt, signupAt, guestAt, lockAt, kickoffAt, signupLabel, guestLabel, lockLabel, kickoffLabel,
}: {
  renderedAt: string
  signupAt: string
  guestAt: string
  lockAt: string
  kickoffAt: string
  signupLabel: string
  guestLabel: string
  lockLabel: string
  kickoffLabel: string
}) {
  const router = useRouter()
  const t = useTranslations('match.countdown')
  const [now, setNow] = useState<number | null>(null)
  const transitions = useMemo(() => [
    { at: Date.parse(signupAt), label: signupLabel },
    { at: Date.parse(guestAt), label: guestLabel },
    { at: Date.parse(lockAt), label: lockLabel },
    { at: Date.parse(kickoffAt), label: kickoffLabel },
  ], [signupAt, guestAt, lockAt, kickoffAt, signupLabel, guestLabel, lockLabel, kickoffLabel])
  const renderedBoundary = latestPassedBoundary(transitions, Date.parse(renderedAt))
  const confirmedRef = useRef(renderedBoundary)
  const lastRequestRef = useRef<number | null>(null)

  useEffect(() => {
    if (renderedBoundary !== null && (confirmedRef.current === null || renderedBoundary > confirmedRef.current)) {
      confirmedRef.current = renderedBoundary
    }
    const tick = () => {
      const currentTime = Date.now()
      setNow(currentTime)
      const passed = latestPassedBoundary(transitions, currentTime)
      if (shouldRequestRefresh({
        confirmed: confirmedRef.current,
        passed,
        now: currentTime,
        lastRequestAt: lastRequestRef.current,
      })) {
        lastRequestRef.current = currentTime
        router.refresh()
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const initial = window.setTimeout(tick, 0)
    const interval = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [renderedBoundary, router, transitions])

  if (now === null) return <Card padding="sm" className="flex items-center justify-center text-muted text-sm"><span aria-hidden="true">—</span></Card>
  const next = nextTransition(transitions, now)
  if (!next) return null

  const parts = countdownParts(next.at - now)
  const partLabel = (part: (typeof parts)[number]) => t(`units.${part.unit}`, { count: part.value })
  const remaining = parts.length > 1
    ? t('join', { first: partLabel(parts[0]), second: partLabel(parts[1]) })
    : partLabel(parts[0])

  return (
    <Card padding="sm" className="bg-surface-muted/60 flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon name="clock" size={16} className="text-primary" />
        <span>{next.label}</span>
      </div>
      <span className="text-sm font-semibold text-ink text-end">{remaining}</span>
    </Card>
  )
}
