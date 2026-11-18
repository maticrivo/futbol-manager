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
