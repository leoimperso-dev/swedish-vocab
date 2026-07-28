import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp } from '@/lib/xp'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await db.user.findMany({
    orderBy: { xp: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      image: true,
      xp: true,
      level: true,
      streakCurrent: true,
      _count: { select: { wordProgress: true } },
    },
  })

  const ranked = users.map((u, i) => ({
    rank: i + 1,
    id: u.id,
    name: u.name,
    image: u.image,
    xp: u.xp,
    level: u.level,
    levelTitle: getLevelForXp(u.xp).title,
    streak: u.streakCurrent,
    wordsStudied: u._count.wordProgress,
    isCurrentUser: u.id === session.user!.id,
  }))

  return NextResponse.json({ leaderboard: ranked })
}
