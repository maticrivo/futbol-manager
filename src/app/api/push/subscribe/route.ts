import { z } from 'zod'
import { getDb } from '@/db'
import { getCurrentMember } from '@/lib/auth'
import { deletePushSubscriptionForMember, savePushSubscription } from '@/lib/push'

export const runtime = 'nodejs'

const endpoint = z.string().url().max(500).refine((value) => new URL(value).protocol === 'https:', {
  message: 'endpoint must be an https URL',
})

const subscribeSchema = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
})

const deleteSchema = z.object({ endpoint })

async function readJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export async function POST(req: Request): Promise<Response> {
  const member = await getCurrentMember()
  if (!member) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (body === null) return Response.json({ error: 'invalid json' }, { status: 400 })

  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'invalid subscription' }, { status: 400 })

  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 255)
  await savePushSubscription(getDb(), {
    memberId: member.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: userAgent || undefined,
  })

  return new Response(null, { status: 204 })
}

export async function DELETE(req: Request): Promise<Response> {
  const member = await getCurrentMember()
  if (!member) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (body === null) return Response.json({ error: 'invalid json' }, { status: 400 })

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'invalid endpoint' }, { status: 400 })

  await deletePushSubscriptionForMember(getDb(), member.id, parsed.data.endpoint)

  // 204 whether or not a row existed, so no one can enumerate other members.
  return new Response(null, { status: 204 })
}
