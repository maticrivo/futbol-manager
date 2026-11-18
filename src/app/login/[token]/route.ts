import { NextResponse } from 'next/server'
import { getDb } from '@/db'
import { loginWithInvite } from '@/domain/members'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

function requestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()

  for (const host of [forwardedHost, req.headers.get('host')]) {
    // Header values must be a hostname (or IP address) with an optional port.
    if (!host || !/^(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])(?::\d+)?$/i.test(host)) continue

    const isLoopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
    const proto = forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : isLoopback ? 'http' : 'https'
    const origin = URL.parse(`${proto}://${host}`)?.origin
    if (origin) return origin
  }

  return new URL(req.url).origin
}

export async function GET(req: Request, { params }: RouteContext<'/login/[token]'>) {
  const { token } = await params
  const origin = requestOrigin(req)
  const result = await loginWithInvite(getDb(), token, new Date())
  if (!result.ok) return NextResponse.redirect(new URL('/login/expired', origin))

  const response = NextResponse.redirect(new URL('/', origin))
  response.cookies.set(SESSION_COOKIE, result.value.sessionToken, SESSION_COOKIE_OPTIONS)
  return response
}
