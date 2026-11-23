'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { classifyPushSupport, urlBase64ToUint8Array, withTimeout } from '@/lib/push-client'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InlineMessage } from '@/components/ui/InlineMessage'

const READY_TIMEOUT_MS = 3000

type Status =
  | 'loading'
  | 'insecure'
  | 'unsupported'
  | 'ios-install'
  | 'denied'
  | 'subscribed'
  | 'not-subscribed'
  | 'misconfigured'
  | 'error'

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

/**
 * Returns a registration whose `pushManager` can be queried. The classic
 * `navigator.serviceWorker.ready` promise waits indefinitely when no worker
 * ever activates, so it is always raced against a timeout and the
 * registration from `register()` is used as the fallback.
 */
async function resolveRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing?.active) return existing
  try {
    const registered = await withTimeout<ServiceWorkerRegistration | null>(
      navigator.serviceWorker.register('/sw.js'),
      READY_TIMEOUT_MS,
      null,
    )
    if (!registered) return existing ?? null
    if (registered.active) return registered
    return withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS, registered)
  } catch {
    return existing ?? null
  }
}

export default function PushSetup() {
  const t = useTranslations()
  const [status, setStatus] = useState<Status>('loading')
  const [busy, setBusy] = useState(false)

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const support = classifyPushSupport({
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'PushManager' in window,
        hasNotification: 'Notification' in window,
        publicKey,
        isIos: isIOS(),
        isStandalone: isStandalone(),
        isSecureContext: window.isSecureContext,
      })
      if (support !== 'supported') {
        if (!cancelled) setStatus(support)
        return
      }
      try {
        const registration = await resolveRegistration()
        if (!registration) throw new Error('no service worker registration')
        const subscription = await withTimeout(
          registration.pushManager.getSubscription(),
          READY_TIMEOUT_MS,
          null,
        )
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
        if (!cancelled) setStatus('error')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [publicKey, attempt])

  function retry() {
    setStatus('loading')
    setAttempt((value) => value + 1)
  }

  async function enable() {
    if (!publicKey) {
      setStatus('misconfigured')
      return
    }
    if (!('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }
      const registration = await resolveRegistration()
      if (!registration?.active) {
        throw new Error('service worker is not active')
      }
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
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const registration = await resolveRegistration()
      if (!registration) {
        setStatus('not-subscribed')
        return
      }
      const subscription = await withTimeout(
        registration.pushManager.getSubscription(),
        READY_TIMEOUT_MS,
        null,
      )
      if (subscription) {
        await subscription.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }
      setStatus('not-subscribed')
    } catch {
      setStatus('error')
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

      {status === 'insecure' && (
        <InlineMessage variant="warning">{t('notifications.push.insecure')}</InlineMessage>
      )}

      {status === 'unsupported' && <InlineMessage variant="info">{t('notifications.push.unsupported')}</InlineMessage>}

      {status === 'misconfigured' && <InlineMessage variant="warning">{t('notifications.push.misconfigured')}</InlineMessage>}

      {status === 'error' && (
        <div className="space-y-3">
          <InlineMessage variant="warning">{t('notifications.push.error')}</InlineMessage>
          <Button
            type="button"
            onClick={retry}
            variant="outline"
            size="sm"
          >
            {t('notifications.push.retry')}
          </Button>
        </div>
      )}

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
