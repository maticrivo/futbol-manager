'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icons'
import { attachPullToRefresh, type PullWindow } from '@/lib/pull-to-refresh-dom'
import { PULL_MAX, PULL_THRESHOLD } from '@/lib/pull-to-refresh'

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
  const offset = refreshing ? 0 : -PULL_MAX + progress * PULL_MAX
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
        <Icon
          name="refresh"
          size={16}
          aria-hidden="true"
          className={cn(refreshing && 'football-spin')}
          style={{ transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
        />
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

  const refreshingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const refreshing = isPending || !minDelayDone

  useEffect(() => {
    const detach = attachPullToRefresh(window as unknown as PullWindow, {
      isRefreshing: () => refreshingRef.current,
      onDistance: setDistance,
      onRefresh: () => {
        refreshingRef.current = true
        setMinDelayDone(false)
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          setMinDelayDone(true)
        }, 500)
        startTransition(() => {
          router.refresh()
        })
      },
    })

    return () => {
      detach()
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [router])

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  return (
    <PullIndicator
      distance={distance}
      refreshing={refreshing}
      label={t('refreshing')}
    />
  )
}
