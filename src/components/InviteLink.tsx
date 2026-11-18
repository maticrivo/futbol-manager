'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function InviteLink({ url }: { url: string }) {
  const t = useTranslations('admin')
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard may be unavailable (insecure context); leave the URL visible to copy by hand.
    }
  }

  return (
    <div className="space-y-1 rounded-md border p-3">
      <p className="text-sm font-medium">{t('invite.heading')}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-sm">
          <bdi dir="ltr">{url}</bdi>
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 cursor-pointer rounded-md border px-3 py-1 text-sm hover:bg-current/5"
        >
          {copied ? t('invite.copied') : t('invite.copy')}
        </button>
      </div>
    </div>
  )
}
