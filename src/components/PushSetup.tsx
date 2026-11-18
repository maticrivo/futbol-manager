'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { urlBase64ToUint8Array } from '@/lib/push-client'

type Status =
  | 'loading'
  | 'unsupported'
  | 'ios-install'
  | 'denied'
  | 'subscribed'
  | 'not-subscribed'
  | 'misconfigured'

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export default function PushSetup() {
  const t = useTranslations()
  const [status, setStatus] = useState<Status>('loading')
  const [busy, setBusy] = useState(false)

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      if (!publicKey) {
        if (!cancelled) setStatus('misconfigured')
        return
      }
      if (isIOS() && !isStandalone()) {
        if (!cancelled) setStatus('ios-install')
        return
      }
      try {
        await navigator.serviceWorker.register('/sw.js')
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!cancelled) {
          setStatus(
            subscription
              ? 'subscribed'
              : Notification.permission === 'denied'
                ? 'denied'
                : 'not-subscribed',
          )
        }
      } catch {
        if (!cancelled) setStatus('unsupported')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [publicKey])

  async function enable() {
    if (!publicKey || !('Notification' in window)) {
      if (!('Notification' in window)) setStatus('unsupported')
      return
    }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) {
        await subscription.unsubscribe()
        throw new Error('subscribe failed')
      }
      setStatus('subscribed')
    } catch {
      setStatus('not-subscribed')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }
      setStatus('not-subscribed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">{t('notifications.push.title')}</h2>
      <p className="text-sm">{t('notifications.push.description')}</p>

      {status === 'loading' && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('notifications.push.loading')}</p>
      )}

      {status === 'unsupported' && <p className="text-sm">{t('notifications.push.unsupported')}</p>}

      {status === 'misconfigured' && <p className="text-sm">{t('notifications.push.misconfigured')}</p>}

      {status === 'ios-install' && (
        <div className="space-y-2">
          <p className="text-sm">{t('notifications.push.iosInstallTitle')}</p>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            <li>{t('notifications.push.iosStep1')}</li>
            <li>{t('notifications.push.iosStep2')}</li>
            <li>{t('notifications.push.iosStep3')}</li>
          </ol>
        </div>
      )}

      {status === 'denied' && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{t('notifications.push.denied')}</p>
      )}

      {status === 'not-subscribed' && (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="cursor-pointer rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? t('notifications.push.enabling') : t('notifications.push.enable')}
        </button>
      )}

      {status === 'subscribed' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{t('notifications.push.subscribed')}</p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-current/5 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? t('notifications.push.disabling') : t('notifications.push.disable')}
          </button>
        </div>
      )}
    </section>
  )
}
