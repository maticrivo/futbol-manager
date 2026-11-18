'use client'

import { useEffect, useState } from 'react'

export default function Countdown({
  signupAt, guestAt, lockAt, kickoffAt, signupLabel, guestLabel, lockLabel, kickoffLabel,
}: {
  signupAt: string
  guestAt: string
  lockAt: string
  kickoffAt: string
  signupLabel: string
  guestLabel: string
  lockLabel: string
  kickoffLabel: string
}) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const initial = window.setTimeout(tick, 0)
    const interval = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [])

  if (now === null) return <p aria-hidden="true">—</p>
  const transitions = [
    { at: Date.parse(signupAt), label: signupLabel },
    { at: Date.parse(guestAt), label: guestLabel },
    { at: Date.parse(lockAt), label: lockLabel },
    { at: Date.parse(kickoffAt), label: kickoffLabel },
  ]
  const next = transitions.sort((a, b) => a.at - b.at).find(({ at }) => at > now)
  if (!next) return null

  const total = Math.ceil((next.at - now) / 1000)
  const clock = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':')
  return <p>{next.label} <bdi className="font-mono tabular-nums">{clock}</bdi></p>
}
