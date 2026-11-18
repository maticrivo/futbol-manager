import { expect, it } from 'vitest'
import { urlBase64ToUint8Array } from '@/lib/push-client'

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
