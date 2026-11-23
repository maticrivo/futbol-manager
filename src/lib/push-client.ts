/**
 * Decodes a base64url string (the format VAPID public keys are delivered in)
 * into a Uint8Array, as required by `pushManager.subscribe`.
 *
 * Pure and browser-agnostic: it relies only on `atob`, which is available in
 * browsers, workers and Node.js (>= 16), and never touches the DOM or Node
 * built-ins.
 */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export type PushSupportStatus =
  | 'insecure'
  | 'unsupported'
  | 'misconfigured'
  | 'ios-install'
  | 'supported'

export type PushSupportInput = {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  publicKey: string | undefined
  isIos: boolean
  isStandalone: boolean
  isSecureContext: boolean
}

/**
 * Decides what the setup card should show before touching any async API.
 * Pure so the branching can be unit-tested without a browser.
 */
export function classifyPushSupport(input: PushSupportInput): PushSupportStatus {
  // Service workers and Web Push are secure-context only; plain HTTP (even on a
  // tailnet or LAN host) can never subscribe, so say that first.
  if (!input.isSecureContext) {
    return 'insecure'
  }
  if (!input.hasServiceWorker || !input.hasPushManager || !input.hasNotification) {
    return 'unsupported'
  }
  if (!input.publicKey) {
    return 'misconfigured'
  }
  if (input.isIos && !input.isStandalone) {
    return 'ios-install'
  }
  return 'supported'
}

/**
 * Settles with `fallback` when `promise` neither fulfills nor rejects within
 * `ms`. `navigator.serviceWorker.ready` is documented to wait indefinitely
 * for an active worker, so callers must not await it without a bound.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}
