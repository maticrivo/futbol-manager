import { getDb } from '@/db'
import { runTick } from '@/domain/tick'
import { defaultTransport } from '@/lib/push'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TICK_SECRET
  if (!secret) return new Response('unauthorized', { status: 401 })

  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 })

  const counts = await runTick(getDb(), new Date(), defaultTransport)
  return Response.json(counts)
}
