'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icons'
import {
  canStartPull,
  isDownwardPull,
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  shouldRefresh,
} from '@/lib/pull-to-refresh'

export function PullIndicator({
  distance,
  refreshing,
  label,
}: {
  distance: number
  refreshing: boolean
  label: string
}) {
  const progress = Math.min(distance, PULL_THRESHOLD) / PULL_THRESHOLD
  const offset = -PULL_MAX + progress * PULL_MAX
  const rotation = progress * 180

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center md:hidden">
      <div
        role="status"
        aria-live="polite"
        className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-primary shadow-card"
        style={{
          transform: `translateY(${offset}px)`,
          opacity: refreshing ? 1 : Math.min(1, distance / 24),
        }}
      >
        <span
          aria-hidden="true"
          className={cn(refreshing && 'football-spin')}
          style={{ transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
        >
          <Icon name="refresh" size={16} />
        </span>
        {refreshing && <span className="sr-only">{label}</span>}
      </div>
    </div>
  )
}

export default function PullToRefresh() {
  const t = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [distance, setDistance] = useState(0)
  const [minDelayDone, setMinDelayDone] = useState(true)

  const distanceRef = useRef(0)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const refreshingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const refreshing = isPending || !minDelayDone

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')

    const setPull = (value: number) => {
      distanceRef.current = value
      setDistance(value)
    }

    const reset = () => {
      startRef.current = null
      setPull(0)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (
        !canStartPull({
          touchCount: event.touches.length,
          scrollY: window.scrollY,
          mobile: media.matches,
          refreshing: refreshingRef.current,
        })
      ) {
        return
      }
      const touch = event.touches[0]
      startRef.current = { x: touch.clientX, y: touch.clientY }
    }

    const onTouchMove = (event: TouchEvent) => {
      const start = startRef.current
      if (!start) return
      if (event.touches.length !== 1) {
        reset()
        return
      }
      const touch = event.touches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      if (window.scrollY > 0) {
        reset()
        return
      }
      if (!isDownwardPull({ deltaX, deltaY })) {
        if (deltaY <= 0) reset()
        return
      }
      if (event.cancelable) event.preventDefault()
      setPull(pullDistance(deltaY))
    }

    const onTouchEnd = () => {
      if (!startRef.current) return
      startRef.current = null
      const current = distanceRef.current
      if (!shouldRefresh(current) || refreshingRef.current) {
        reset()
        return
      }

      refreshingRef.current = true
      setMinDelayDone(false)
      setPull(PULL_THRESHOLD)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        setMinDelayDone(true)
      }, 500)
      startTransition(() => {
        router.refresh()
      })
    }

    const onTouchCancel = () => reset()
    const onOrientationChange = () => reset()
    const onMediaChange = () => {
      if (!media.matches) reset()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchCancel)
    window.addEventListener('orientationchange', onOrientationChange)
    media.addEventListener('change', onMediaChange)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
      window.removeEventListener('orientationchange', onOrientationChange)
      media.removeEventListener('change', onMediaChange)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [router])

  useEffect(() => {
    refreshingRef.current = refreshing
    if (!refreshing && distanceRef.current !== 0) {
      distanceRef.current = 0
      setDistance(0)
    }
  }, [refreshing])

  return (
    <PullIndicator
      distance={distance}
      refreshing={refreshing}
      label={t('refreshing')}
    />
  )
}
