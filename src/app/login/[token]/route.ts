import { NextResponse } from 'next/server'
import { getDb } from '@/db'
import { loginWithInvite } from '@/domain/members'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { requestOrigin } from '@/lib/request-origin'

export async function GET(req: Request, { params }: RouteContext<'/login/[token]'>) {
  const { token } = await params
  const origin = requestOrigin(req.headers, req.url)
  const result = await loginWithInvite(getDb(), token, new Date())
  if (!result.ok) return NextResponse.redirect(new URL('/login/expired', origin))

  const response = NextResponse.redirect(new URL('/', origin))
  response.cookies.set(SESSION_COOKIE, result.value.sessionToken, SESSION_COOKIE_OPTIONS)
  return response
}
