import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, levelTitle } from '@/lib/xp'
import { toLocalDateString } from '@/lib/streak'
import { getCourse } from '@/lib/current-course'
import { CONTEST_TIMEZONE, closeFinishedWeeks, currentWeekStart, weeklyWinCounts } from '@/lib/weekly'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // A finished week is settled on the first read after it ends — no cron
  await closeFinishedWeeks()

  const period = req.nextUrl.searchParams.get('period') === 'week' ? 'week' : 'all'
  // Rank names follow the reader's course: a board mixing five languages of
  // titles reads as noise
  const course = await getCourse(session.user.id)

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
      lastSeenAt: true,
      _count: { select: { wordProgress: true } },
    },
  })

  let entries = users.map(u => ({ user: u, xp: u.xp, wordsStudied: u._count.wordProgress }))

  if (period === 'week') {
    // One week for everyone, in the contest timezone: a race whose finish line
    // moves with the viewer's timezone is not a race — see lib/weekly.ts
    const monday = currentWeekStart()
    const weekSessions = await db.studySession.findMany({
      where: { endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 8 * 86400000) } },
      select: { userId: true, startedAt: true, xpGained: true, wordsStudied: true },
    })
    const byUser = new Map<string, { xp: number; words: number }>()
    for (const s of weekSessions) {
      if (toLocalDateString(s.startedAt, CONTEST_TIMEZONE) < monday) continue
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

  const wins = await weeklyWinCounts(users.map(u => u.id))

  const ranked = entries.map((e, i) => ({
    rank: i + 1,
    id: e.user.id,
    name: e.user.name,
    image: e.user.image,
    xp: e.xp,
    level: e.user.level,
    levelTitle: levelTitle(getLevelForXp(e.user.xp), course.learned),
    streak: e.user.streakCurrent,
    wordsStudied: e.wordsStudied,
    weeklyWins: wins.get(e.user.id) ?? 0,
    lastSeenAt: e.user.lastSeenAt?.toISOString() ?? null,
    isCurrentUser: e.user.id === session.user!.id,
  }))

  return NextResponse.json({ leaderboard: ranked, period })
}
