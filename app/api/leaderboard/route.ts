import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp } from '@/lib/xp'
import { toLocalDateString } from '@/lib/streak'

function mondayOfCurrentWeek(timezone: string): string {
  const today = toLocalDateString(new Date(), timezone)
  const dayOfWeek = new Date(today).getUTCDay() // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7
  return new Date(Date.parse(today) - daysSinceMonday * 86400000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = req.nextUrl.searchParams.get('period') === 'week' ? 'week' : 'all'

  const users = await db.user.findMany({
    orderBy: { xp: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      image: true,
      xp: true,
      level: true,
      timezone: true,
      streakCurrent: true,
      _count: { select: { wordProgress: true } },
    },
  })

  let entries = users.map(u => ({ user: u, xp: u.xp, wordsStudied: u._count.wordProgress }))

  if (period === 'week') {
    const viewer = users.find(u => u.id === session.user!.id)
    const monday = mondayOfCurrentWeek(viewer?.timezone ?? 'Europe/Brussels')
    const weekSessions = await db.studySession.findMany({
      where: { endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 8 * 86400000) } },
      select: { userId: true, startedAt: true, xpGained: true, wordsStudied: true },
    })
    const byUser = new Map<string, { xp: number; words: number }>()
    for (const s of weekSessions) {
      const tz = users.find(u => u.id === s.userId)?.timezone ?? 'Europe/Brussels'
      if (toLocalDateString(s.startedAt, tz) < monday) continue
      const agg = byUser.get(s.userId) ?? { xp: 0, words: 0 }
      agg.xp += s.xpGained
      agg.words += s.wordsStudied
      byUser.set(s.userId, agg)
    }
    entries = users.map(u => ({
      user: u,
      xp: byUser.get(u.id)?.xp ?? 0,
      wordsStudied: byUser.get(u.id)?.words ?? 0,
    }))
    entries.sort((a, b) => b.xp - a.xp)
  }

  const ranked = entries.map((e, i) => ({
    rank: i + 1,
    id: e.user.id,
    name: e.user.name,
    image: e.user.image,
    xp: e.xp,
    level: e.user.level,
    levelTitle: getLevelForXp(e.user.xp).title,
    streak: e.user.streakCurrent,
    wordsStudied: e.wordsStudied,
    isCurrentUser: e.user.id === session.user!.id,
  }))

  return NextResponse.json({ leaderboard: ranked, period })
}
