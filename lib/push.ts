// Web Push, used to tell a player it is their turn.
//
// Entirely optional: with no VAPID keys configured the app never asks for
// permission and `notify` is a no-op, so a deployment without keys behaves
// exactly like one without the feature. Generate a pair with
// `npx web-push generate-vapid-keys` and put them in .env.
import webpush from 'web-push'
import { db } from '@/lib/db'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com'

export const pushEnabled = Boolean(PUBLIC_KEY && PRIVATE_KEY)

if (pushEnabled) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!)

export interface PushPayload {
  title: string
  body: string
  url: string
  /** Collapses repeats: a second "your turn" replaces the first, never stacks. */
  tag?: string
}

/**
 * Sends to every device the user registered. A push failure is never allowed
 * to fail the request that triggered it — the in-app badge is the source of
 * truth, this is only a convenience.
 */
export async function notify(userId: string, payload: PushPayload): Promise<void> {
  if (!pushEnabled) return
  const subs = await db.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) return

  const body = JSON.stringify(payload)
  const gone: string[] = []

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
      } catch (err) {
        // 404/410 mean the browser dropped the subscription — stop sending to it
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(sub.endpoint)
      }
    }),
  )

  if (gone.length > 0) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: gone } } })
  }
}
