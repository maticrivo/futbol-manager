import { expect, it } from 'vitest'
import { requestOrigin } from '@/lib/request-origin'

const fallback = 'http://localhost:3000/login/token?source=invite'

it.each([
  ['127.0.0.1:3411', 'http://127.0.0.1:3411'],
  ['127.0.0.2:3411', 'http://127.0.0.2:3411'],
  ['[::1]:3411', 'http://[::1]:3411'],
  ['localhost:3411', 'http://localhost:3411'],
  ['football.example.com', 'https://football.example.com'],
])('chooses the default protocol for Host %s', (host, origin) => {
  expect(requestOrigin(new Headers({ Host: host }), fallback)).toBe(origin)
})

it('prefers the first forwarded host and protocol', () => {
  const headers = new Headers({
    Host: '127.0.0.1:3411',
    'X-Forwarded-Host': 'football.example.test',
    'X-Forwarded-Proto': 'HTTPS, http',
  })
  expect(requestOrigin(headers, fallback)).toBe('https://football.example.test')
  headers.set('X-Forwarded-Host', 'a.example, b.example')
  headers.delete('X-Forwarded-Proto')
  expect(requestOrigin(headers, fallback)).toBe('https://a.example')
})

it('uses the host default for an invalid forwarded protocol', () => {
  const headers = new Headers({ Host: '127.0.0.2:3411', 'X-Forwarded-Proto': 'javascript' })
  expect(requestOrigin(headers, fallback)).toBe('http://127.0.0.2:3411')
  headers.set('Host', 'good.example')
  expect(requestOrigin(headers, fallback)).toBe('https://good.example')
})

it.each([
  'bad..example',
  `${'a'.repeat(64)}.example`,
  Array(4).fill('a'.repeat(63)).join('.'),
  '-bad.example',
  'bad-.example',
  'bad.example/login',
  'bad example',
  'bad.example:no',
  'bad.example:65536',
  '[:::1]:3411',
])('falls through from malformed forwarded host %s to Host', (forwardedHost) => {
  const headers = new Headers({ Host: 'good.example', 'X-Forwarded-Host': forwardedHost })
  expect(requestOrigin(headers, fallback)).toBe('https://good.example')
})

it('uses only the fallback origin when neither header is usable', () => {
  expect(requestOrigin(new Headers({ Host: '', 'X-Forwarded-Host': 'bad..example' }), fallback))
    .toBe('http://localhost:3000')
})
