import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { wordId, favorite } = await req.json()
  if (typeof wordId !== 'string' || typeof favorite !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (favorite) {
    await db.favorite.upsert({
      where: { userId_wordId: { userId, wordId } },
      create: { userId, wordId },
      update: {},
    })
  } else {
    await db.favorite.deleteMany({ where: { userId, wordId } })
  }

  return NextResponse.json({ ok: true })
}
