import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

/**
 * The learner's daily-reminder preference. Stored on the account rather than
 * on the device: the reminder is sent by a server that has no idea which
 * browser the switch was flipped in, and a learner with a phone and a laptop
 * means one reminder, not two settings.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { enabled?: unknown; hour?: unknown }
  const data: { reminderEnabled?: boolean; reminderHour?: number } = {}

  if (typeof body.enabled === 'boolean') data.reminderEnabled = body.enabled
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
    select: { reminderEnabled: true, reminderHour: true },
  })
  return NextResponse.json(user)
}
