'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import {
  INSTALL_DISMISS_KEY,
  installDismissalValue,
  isIosDevice,
  isMobileInstallTarget,
  shouldShowInstallBanner,
} from '@/lib/install-client'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallSnapshot = {
  ios: boolean
  mobile: boolean
  standalone: boolean
  dismissedUntil: string | null
  checkedAt: number
}

const SERVER_SNAPSHOT: InstallSnapshot = {
  ios: false,
  mobile: false,
  standalone: false,
  dismissedUntil: null,
  checkedAt: 0,
}

let snapshotCache: { key: string; value: InstallSnapshot } | null = null

/**
 * Reads the browser-only install state. Cached so `useSyncExternalStore` gets
 * a stable object between changes (standalone mode, dismissal, device).
 */
function getSnapshot(): InstallSnapshot {
  const ua = navigator.userAgent
  const platform = navigator.platform
  const touchPoints = navigator.maxTouchPoints

  let dismissedUntil: string | null = null
  try {
    dismissedUntil = localStorage.getItem(INSTALL_DISMISS_KEY)
  } catch {
    // Storage can be unavailable (private mode); treat it as not dismissed.
  }

  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const standalone = mediaStandalone || iosStandalone

  const key = [ua, platform, touchPoints, standalone, dismissedUntil].join('|')
  if (!snapshotCache || snapshotCache.key !== key) {
    snapshotCache = {
      key,
      value: {
        ios: isIosDevice(ua, platform, touchPoints),
        mobile: isMobileInstallTarget(ua, touchPoints),
        standalone,
        dismissedUntil,
        checkedAt: Date.now(),
      },
    }
  }
  return snapshotCache.value
}

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const media = window.matchMedia('(display-mode: standalone)')
  media.addEventListener('change', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * Small top banner for mobile browsers that are not running as an installed
 * web app. iPhone cannot be prompted programmatically, so its action expands
 * the Share → Add to Home Screen steps. Chrome on Android gets the native
 * install prompt when the browser offers it.
 */
export default function InstallBanner() {
  const t = useTranslations('installBanner')
  const tp = useTranslations('notifications.push')

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
  const [dismissedNow, setDismissedNow] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      const state = getSnapshot()
      // Leave Chrome's own install UI alone on desktop and when already installed.
      if (!state.mobile || state.standalone) return
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, installDismissalValue(Date.now()))
    } catch {
      // Storage can be unavailable (private mode); the banner still closes.
    }
    setDismissedNow(true)
  }

  async function startInstall() {
    if (!installEvent) {
      setExpanded((value) => !value)
      return
    }

    const event = installEvent
    setInstallEvent(null)
    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
      }
    } catch {
      setExpanded(true)
    }
  }

  const visible =
    !dismissedNow &&
    !installed &&
    shouldShowInstallBanner({
      isMobile: snapshot.mobile,
      isStandalone: snapshot.standalone,
      dismissedUntil: snapshot.dismissedUntil,
      now: snapshot.checkedAt,
    })

  if (!visible) return null

  const canExpand = snapshot.ios || !installEvent

  return (
    <aside
      aria-label={t('title')}
      className="sticky top-0 z-40 border-b border-line bg-primary-soft"
    >
      <div className="mx-auto max-w-5xl px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-start">
            <p className="text-sm font-semibold text-ink">{t('title')}</p>
            <p className="text-xs leading-snug text-muted">{t('description')}</p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void startInstall()}
            aria-expanded={canExpand ? expanded : undefined}
            aria-controls={canExpand ? 'install-banner-steps' : undefined}
          >
            {installEvent ? t('install') : t('howTo')}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={dismiss}
            aria-label={t('dismiss')}
          >
            <Icon name="x" size={18} />
          </Button>
        </div>

        {expanded && (
          <div
            id="install-banner-steps"
            className="mt-2 rounded-[var(--radius-md)] border border-line bg-surface p-3 text-sm text-muted"
          >
            {snapshot.ios ? (
              <ol className="list-inside list-decimal space-y-1">
                <li>{tp('iosStep1')}</li>
                <li>{tp('iosStep2')}</li>
                <li>{tp('iosStep3')}</li>
              </ol>
            ) : (
              <p>{t('androidHint')}</p>
            )}
            <p className="mt-2 text-xs">{t('browserHint')}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
