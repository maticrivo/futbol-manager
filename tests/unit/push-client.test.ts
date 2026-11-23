import { describe, expect, it, vi } from 'vitest'
import { classifyPushSupport, urlBase64ToUint8Array, withTimeout } from '@/lib/push-client'

const baseSupport = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  publicKey: 'BBrRLOWm_vnVwCNIl45nGzPBYbAyLyOH8zj_Ao_A3h2AkKlyHktHKeUedC9Yg9TlYJV3xdiktxKAoIazGaJH-WU',
  isIos: false,
  isStandalone: false,
  isSecureContext: true,
}

it('decodes a known base64url string to the expected bytes', () => {
  expect(urlBase64ToUint8Array('SGVsbG8')).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]))
})

it('handles URL-safe characters (- and _)', () => {
  expect(urlBase64ToUint8Array('-_w')).toEqual(new Uint8Array([0xfb, 0xfc]))
})

it('adds missing padding and returns the full byte length', () => {
  // 87 base64url chars == 65 bytes (the length of an uncompressed P-256 VAPID key).
  const bytes = urlBase64ToUint8Array('A'.repeat(87))
  expect(bytes).toHaveLength(65)
  expect([...bytes].every((b) => b === 0)).toBe(true)
})

describe('classifyPushSupport', () => {
  it('reports insecure before anything else when the page is not a secure context', () => {
    expect(classifyPushSupport({ ...baseSupport, isSecureContext: false })).toBe('insecure')
    expect(
      classifyPushSupport({
        ...baseSupport,
        isSecureContext: false,
        hasServiceWorker: false,
        hasPushManager: false,
        hasNotification: false,
        publicKey: '',
      }),
    ).toBe('insecure')
  })

  it('reports unsupported when a required push API is missing', () => {
    expect(classifyPushSupport({ ...baseSupport, hasServiceWorker: false })).toBe('unsupported')
    expect(classifyPushSupport({ ...baseSupport, hasPushManager: false })).toBe('unsupported')
    expect(classifyPushSupport({ ...baseSupport, hasNotification: false })).toBe('unsupported')
  })

  it('reports misconfigured when the VAPID public key is missing', () => {
    expect(classifyPushSupport({ ...baseSupport, publicKey: '' })).toBe('misconfigured')
    expect(classifyPushSupport({ ...baseSupport, publicKey: undefined })).toBe('misconfigured')
  })

  it('reports needs-install on iOS unless the app runs standalone', () => {
    expect(classifyPushSupport({ ...baseSupport, isIos: true, isStandalone: false })).toBe('ios-install')
    expect(classifyPushSupport({ ...baseSupport, isIos: true, isStandalone: true })).toBe('supported')
  })

  it('reports supported when every requirement holds', () => {
    expect(classifyPushSupport(baseSupport)).toBe('supported')
  })
})

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('fast'), 1000, 'slow')).resolves.toBe('fast')
  })

  it('resolves with the fallback when the promise never settles', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const result = withTimeout(never, 5000, 'fallback')
    await vi.advanceTimersByTimeAsync(5000)
    await expect(result).resolves.toBe('fallback')
    vi.useRealTimers()
  })

  it('resolves with the fallback when the promise rejects after the timeout', async () => {
    vi.useFakeTimers()
    const lateReject = new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error('late')), 9999)
    })
    const result = withTimeout(lateReject, 500, 'fallback')
    await vi.advanceTimersByTimeAsync(500)
    await expect(result).resolves.toBe('fallback')
    vi.useRealTimers()
  })
})
