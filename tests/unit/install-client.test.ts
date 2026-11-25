import { describe, expect, it } from 'vitest'
import {
  INSTALL_DISMISS_KEY,
  INSTALL_DISMISS_MS,
  installDismissalValue,
  isInstallDismissed,
  isIosDevice,
  isMobileInstallTarget,
  shouldShowInstallBanner,
} from '@/lib/install-client'

const now = 1_800_000_000_000

describe('isMobileInstallTarget', () => {
  it('recognises Android phones and tablets', () => {
    expect(
      isMobileInstallTarget(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
        5,
      ),
    ).toBe(true)
  })

  it('recognises iPhones and iPads', () => {
    expect(
      isMobileInstallTarget(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        5,
      ),
    ).toBe(true)
    expect(
      isMobileInstallTarget(
        'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        5,
      ),
    ).toBe(true)
  })

  it('recognises iPadOS, which reports a desktop Mac user agent', () => {
    expect(
      isMobileInstallTarget(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        5,
      ),
    ).toBe(true)
  })

  it('ignores desktop browsers without touch support', () => {
    expect(
      isMobileInstallTarget(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        0,
      ),
    ).toBe(false)
    expect(
      isMobileInstallTarget(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        0,
      ),
    ).toBe(false)
  })
})

describe('isIosDevice', () => {
  it('recognises iPhone and iPad user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5)).toBe(true)
  })

  it('recognises iPadOS reporting as a Mac with touch', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true)
  })

  it('does not treat a real Mac or Android as iOS', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false)
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5)).toBe(false)
  })
})

describe('install dismissal', () => {
  it('is not dismissed when nothing was stored', () => {
    expect(isInstallDismissed(null, now)).toBe(false)
    expect(isInstallDismissed('', now)).toBe(false)
  })

  it('is dismissed while the stored timestamp is in the future', () => {
    expect(isInstallDismissed(String(now + 1), now)).toBe(true)
  })

  it('is no longer dismissed once the timestamp passes', () => {
    expect(isInstallDismissed(String(now), now)).toBe(false)
    expect(isInstallDismissed(String(now - 1), now)).toBe(false)
  })

  it('ignores malformed values', () => {
    expect(isInstallDismissed('later', now)).toBe(false)
  })

  it('stores a timestamp one dismissal window ahead', () => {
    expect(installDismissalValue(now)).toBe(String(now + INSTALL_DISMISS_MS))
    expect(INSTALL_DISMISS_KEY).toBe('install-banner-dismissed-until')
  })
})

describe('shouldShowInstallBanner', () => {
  const base = {
    isMobile: true,
    isStandalone: false,
    dismissedUntil: null,
    now,
  }

  it('shows on a mobile browser that has not dismissed it', () => {
    expect(shouldShowInstallBanner(base)).toBe(true)
  })

  it('hides when the app runs installed', () => {
    expect(shouldShowInstallBanner({ ...base, isStandalone: true })).toBe(false)
  })

  it('hides on desktop', () => {
    expect(shouldShowInstallBanner({ ...base, isMobile: false })).toBe(false)
  })

  it('hides after dismissal', () => {
    expect(
      shouldShowInstallBanner({ ...base, dismissedUntil: String(now + INSTALL_DISMISS_MS) }),
    ).toBe(false)
  })

  it('shows again after the dismissal expires', () => {
    expect(shouldShowInstallBanner({ ...base, dismissedUntil: String(now - 1) })).toBe(true)
  })
})
