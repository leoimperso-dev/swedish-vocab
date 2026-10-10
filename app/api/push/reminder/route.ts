import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

/**
 * What the learner wants to be sent, and when. Stored on the account rather
 * than on the device: the server sending them has no idea which browser a
 * switch was flipped in, and someone with a phone and a laptop means one
 * preference, not two.
 *
 * Which devices receive them is the separate, per-device question answered by
 * the push subscription itself (`/api/push/subscribe`).
 */
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { enabled?: unknown; hour?: unknown; duels?: unknown }
  const data: { reminderEnabled?: boolean; reminderHour?: number; duelNotifications?: boolean } = {}

  if (typeof body.enabled === 'boolean') data.reminderEnabled = body.enabled
  if (typeof body.duels === 'boolean') data.duelNotifications = body.duels
  if (typeof body.hour === 'number') {
    if (!Number.isInteger(body.hour) || body.hour < 0 || body.hour > 23) {
      return NextResponse.json({ error: 'hour must be 0-23' }, { status: 400 })
    }
    data.reminderHour = body.hour
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const user = await db.user.update({
    where: { id: session.user.id },
    data,
    select: { reminderEnabled: true, reminderHour: true, duelNotifications: true },
  })
  return NextResponse.json(user)
}
