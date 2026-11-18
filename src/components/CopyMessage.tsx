'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export default function CopyMessage({ text, label }: { text: string; label: string }) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-current/5"
      >
        {label}
      </button>
      {copied && (
        <span aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
          {t('copy.copied')}
        </span>
      )}
    </div>
  )
}
