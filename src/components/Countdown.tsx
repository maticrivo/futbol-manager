'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { latestPassedBoundary, nextTransition } from '@/lib/countdown'

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
  const [now, setNow] = useState<number | null>(null)
  const transitions = useMemo(() => [
    { at: Date.parse(signupAt), label: signupLabel },
    { at: Date.parse(guestAt), label: guestLabel },
    { at: Date.parse(lockAt), label: lockLabel },
    { at: Date.parse(kickoffAt), label: kickoffLabel },
  ], [signupAt, guestAt, lockAt, kickoffAt, signupLabel, guestLabel, lockLabel, kickoffLabel])
  const renderedBoundary = latestPassedBoundary(transitions, Date.parse(renderedAt))
  const lastRefreshRef = useRef(renderedBoundary)

  useEffect(() => {
    // A new server payload can already reflect a boundary; don't reload it again.
    if (renderedBoundary !== null && (lastRefreshRef.current === null || renderedBoundary > lastRefreshRef.current)) {
      lastRefreshRef.current = renderedBoundary
    }
    const tick = () => {
      const currentTime = Date.now()
      setNow(currentTime)
      const passed = latestPassedBoundary(transitions, currentTime)
      if (passed !== null && (lastRefreshRef.current === null || passed > lastRefreshRef.current)) {
        lastRefreshRef.current = passed
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

  if (now === null) return <p aria-hidden="true">—</p>
  const next = nextTransition(transitions, now)
  if (!next) return null

  const total = Math.ceil((next.at - now) / 1000)
  const clock = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':')
  return <p>{next.label} <bdi className="font-mono tabular-nums">{clock}</bdi></p>
}
