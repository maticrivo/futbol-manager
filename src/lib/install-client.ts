/**
 * Detection helpers for the "install as a web app" banner.
 *
 * Pure and browser-agnostic: callers pass the user agent, platform and touch
 * count, so the branching can be unit-tested without a DOM.
 */

export const INSTALL_DISMISS_KEY = 'install-banner-dismissed-until'
export const INSTALL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * True on phones and tablets (Android, iPhone, iPad, and iPadOS which reports
 * a desktop Mac user agent). Desktop browsers are excluded on purpose.
 */
export function isMobileInstallTarget(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return true
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1
}

/** True on iPhone, iPad OS, and iPadOS running in desktop mode. */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true
  return platform === 'MacIntel' && maxTouchPoints > 1
}

/** Whether a stored dismissal timestamp still hides the banner. */
export function isInstallDismissed(value: string | null, now: number): boolean {
  if (!value) return false
  const until = Number(value)
  return Number.isFinite(until) && until > now
}

/** The value to persist when the member dismisses the banner. */
export function installDismissalValue(now: number): string {
  return String(now + INSTALL_DISMISS_MS)
}

export type InstallBannerInput = {
  isMobile: boolean
  isStandalone: boolean
  dismissedUntil: string | null
  now: number
}

/** The banner only targets mobile browsers that are not already installed. */
export function shouldShowInstallBanner(input: InstallBannerInput): boolean {
  if (!input.isMobile) return false
  if (input.isStandalone) return false
  return !isInstallDismissed(input.dismissedUntil, input.now)
}
