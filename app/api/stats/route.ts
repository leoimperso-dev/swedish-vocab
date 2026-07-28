import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const [
    user,
    totalWords,
    masteredCount,
    dueCount,
    recentSessions,
    hardestWords,
    categoryStats,
    achievements,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { xp: true, level: true, streakCurrent: true, streakBest: true } }),
    db.userWord.count({ where: { userId } }),
    db.userWord.count({ where: { userId, interval: { gt: 21 } } }),
    db.userWord.count({ where: { userId, nextReview: { lte: now } } }),
    db.studySession.findMany({
      where: { userId, startedAt: { gte: thirtyDaysAgo }, endedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, wordsStudied: true, wordsCorrect: true, xpGained: true },
    }),
    db.userWord.findMany({
      where: { userId, incorrectCount: { gt: 0 } },
      orderBy: { incorrectCount: 'desc' },
      take: 10,
      include: { word: { select: { swedish: true, french: true } } },
    }),
    db.userWord.groupBy({
      by: ['wordId'],
      where: { userId },
      _count: true,
    }),
    db.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
    }),
  ])

  // Build 7-day activity chart
  const weekActivity = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now.getTime() - i * 86400000)
    const dayStr = day.toISOString().split('T')[0]
    const sessions = recentSessions.filter(s => s.startedAt.toISOString().startsWith(dayStr))
    return {
      date: dayStr,
      wordsStudied: sessions.reduce((sum, s) => sum + s.wordsStudied, 0),
      xp: sessions.reduce((sum, s) => sum + s.xpGained, 0),
    }
  }).reverse()

  // Accuracy last 30 days
  const totalAnswers = recentSessions.reduce((sum, s) => sum + s.wordsStudied, 0)
  const correctAnswers = recentSessions.reduce((sum, s) => sum + s.wordsCorrect, 0)
  const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0

  return NextResponse.json({
    user,
    totalWords,
    masteredCount,
    dueCount,
    accuracy,
    weekActivity,
    hardestWords: hardestWords.map(uw => ({
      swedish: uw.word.swedish,
      french: uw.word.french,
      incorrectCount: uw.incorrectCount,
      correctCount: uw.correctCount,
    })),
    achievements: achievements.map(ua => ({
      slug: ua.achievement.slug,
      name: ua.achievement.name,
      icon: ua.achievement.icon,
      unlockedAt: ua.unlockedAt,
    })),
  })
}
