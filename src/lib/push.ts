import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { pushSubscriptions } from '@/db/schema'

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type NotificationPayload = { title: string; body: string; url: string }
export type PushTransport = (subscription: PushSubscriptionRow, payload: NotificationPayload) => Promise<{ statusCode: number }>

type SubscriptionInput = {
  memberId: number
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

export async function savePushSubscription(db: Db, { endpoint, memberId, p256dh, auth, userAgent }: SubscriptionInput): Promise<void> {
  const details = { memberId, p256dh, auth, userAgent: userAgent ?? null }
  await db.insert(pushSubscriptions).values({ endpoint, ...details }).onDuplicateKeyUpdate({ set: details })
}

export async function deletePushSubscription(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
}

export async function sendWebPush(
  db: Db, memberId: number, payload: NotificationPayload, transport: PushTransport,
): Promise<{ sent: number; removed: number }> {
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, memberId))
  let sent = 0
  let removed = 0
  for (const subscription of subscriptions) {
    const { statusCode } = await transport(subscription, payload)
    sent++
    if (statusCode === 404 || statusCode === 410) {
      const [result] = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
      removed += result.affectedRows
    }
  }
  return { sent, removed }
}

// web-push 4 does not ship declarations; describe only the API we use.
type WebPush = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  sendNotification(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, data: string): Promise<{ statusCode: number }>
  WebPushError: new (...args: never[]) => Error & { statusCode: number }
}

let configuredWebPush: WebPush | undefined

async function getWebPush(): Promise<WebPush> {
  if (configuredWebPush) return configuredWebPush
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Web Push requires VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY')
  }
  // @ts-expect-error web-push 4 has no TypeScript declarations
  const webPush: WebPush = await import('web-push')
  if (!configuredWebPush) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    configuredWebPush = webPush
  }
  return configuredWebPush
}

export const defaultTransport: PushTransport = async ({ endpoint, p256dh, auth }, payload) => {
  const webPush = await getWebPush()
  try {
    return await webPush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(payload))
  } catch (error) {
    // web-push rejects HTTP error responses; normalize these, not network failures.
    if (error instanceof webPush.WebPushError) return { statusCode: error.statusCode }
    throw error
  }
}
