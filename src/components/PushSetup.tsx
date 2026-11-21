'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { urlBase64ToUint8Array } from '@/lib/push-client'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InlineMessage } from '@/components/ui/InlineMessage'

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
    <Card className="space-y-4 p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">{t('notifications.push.title')}</h2>
        <p className="text-sm text-muted">{t('notifications.push.description')}</p>
      </div>

      {status === 'loading' && (
        <p className="text-sm text-muted">{t('notifications.push.loading')}</p>
      )}

      {status === 'unsupported' && <InlineMessage variant="info">{t('notifications.push.unsupported')}</InlineMessage>}

      {status === 'misconfigured' && <InlineMessage variant="warning">{t('notifications.push.misconfigured')}</InlineMessage>}

      {status === 'ios-install' && (
        <InlineMessage variant="info" title={t('notifications.push.iosInstallTitle')}>
          <ol className="list-inside list-decimal space-y-1 mt-2 text-sm">
            <li>{t('notifications.push.iosStep1')}</li>
            <li>{t('notifications.push.iosStep2')}</li>
            <li>{t('notifications.push.iosStep3')}</li>
          </ol>
        </InlineMessage>
      )}

      {status === 'denied' && (
        <InlineMessage variant="warning">{t('notifications.push.denied')}</InlineMessage>
      )}

      {status === 'not-subscribed' && (
        <Button
          type="button"
          onClick={enable}
          isLoading={busy}
          variant="primary"
        >
          {t('notifications.push.enable')}
        </Button>
      )}

      {status === 'subscribed' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <InlineMessage variant="success" className="border-0 bg-transparent p-0">
            {t('notifications.push.subscribed')}
          </InlineMessage>
          <Button
            type="button"
            onClick={disable}
            isLoading={busy}
            variant="outline"
            size="sm"
          >
            {t('notifications.push.disable')}
          </Button>
        </div>
      )}
    </Card>
  )
}
