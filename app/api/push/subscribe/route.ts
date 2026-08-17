import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { pushEnabled } from '@/lib/push'

interface Body {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!pushEnabled) return NextResponse.json({ error: 'Push disabled' }, { status: 503 })

  const { endpoint, keys }: Body = await req.json()
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // An endpoint is unique per device: re-subscribing on a device the user
  // already registered (or moved to another account) updates the row.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint }: Body = await req.json()
  if (endpoint) {
    await db.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })
  }
  return NextResponse.json({ ok: true })
}
