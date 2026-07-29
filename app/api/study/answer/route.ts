import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { sm2Update, qualityFromResult } from '@/lib/sm2'
import { calculateSessionXp, getLevelForXp } from '@/lib/xp'
import { updateStreak, toLocalDateString } from '@/lib/streak'
import { checkNewAchievements } from '@/lib/achievements'
import type { AnswerPayload } from '@/types'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const body: AnswerPayload = await req.json()
  const { wordId, result, sessionId } = body

  // 1. Update or create UserWord with SM-2
  const existing = await db.userWord.findUnique({ where: { userId_wordId: { userId, wordId } } })

  const quality = qualityFromResult(result)
  const currentState = existing ?? { easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: new Date() }
  const newState = sm2Update(currentState, quality)

  const userWord = await db.userWord.upsert({
    where: { userId_wordId: { userId, wordId } },
    create: {
      userId, wordId,
      ...newState,
      correctCount: result === 'correct' ? 1 : 0,
      incorrectCount: result === 'incorrect' ? 1 : 0,
      approxCount: result === 'approximate' ? 1 : 0,
      lastResult: result,
      lastStudied: new Date(),
    },
    update: {
      ...newState,
      correctCount: result === 'correct' ? { increment: 1 } : undefined,
      incorrectCount: result === 'incorrect' ? { increment: 1 } : undefined,
      approxCount: result === 'approximate' ? { increment: 1 } : undefined,
      lastResult: result,
      lastStudied: new Date(),
    },
  })

  // 2. Update session stats
  await db.studySession.update({
    where: { id: sessionId },
    data: {
      wordsStudied: { increment: 1 },
      wordsCorrect: result === 'correct' ? { increment: 1 } : undefined,
      wordsApprox: result === 'approximate' ? { increment: 1 } : undefined,
    },
  })

  return NextResponse.json({ userWord })
}

export async function PUT(req: NextRequest) {
  // Called at end of session to finalize XP, streak, achievements
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { sessionId, results, bestCombo } = await req.json()

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { achievements: { include: { achievement: true } } },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Streak (freezes can absorb missed days)
  const streakUpdate = updateStreak(
    user.lastStudiedAt, user.streakCurrent, user.streakBest, user.timezone, user.freezeCount
  )

  // XP
  const { total: xpGained, breakdown } = calculateSessionXp(results, streakUpdate.isFirstStudyOfDay)
  const newXp = user.xp + xpGained
  const oldLevel = user.level
  const newLevel = getLevelForXp(newXp).level

  // Achievements
  const totalStudied = await db.userWord.count({ where: { userId } })
  const masteredVerbs = await db.userWord.count({
    where: { userId, interval: { gt: 21 }, word: { wordType: 'VERB' } },
  })
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const studiedToday = await db.userWord.count({ where: { userId, lastStudied: { gte: todayStart } } })

  const unlockedSlugs = user.achievements.map(ua => ua.achievement.slug)
  const newAchievements = checkNewAchievements(unlockedSlugs, {
    totalWordsStudied: totalStudied,
    streakCurrent: streakUpdate.streakCurrent,
    wordsStudiedToday: studiedToday,
    masteredVerbCount: masteredVerbs,
    sessionPerfect: results.every((r: string) => r === 'correct') && results.length >= 15,
  })

  // Daily goal — XP earned today (user timezone) including this session
  const today = toLocalDateString(new Date(), user.timezone)
  const recentSessions = await db.studySession.findMany({
    where: { userId, endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 36 * 3600000) } },
    select: { startedAt: true, xpGained: true },
  })
  const priorXpToday = recentSessions
    .filter(s => toLocalDateString(s.startedAt, user.timezone) === today)
    .reduce((sum, s) => sum + s.xpGained, 0)

  // Save everything
  const achievementXp = newAchievements.reduce((sum, a) => sum + a.xpReward, 0)

  const achievementDefs = await db.achievement.findMany({
    where: { slug: { in: newAchievements.map(a => a.slug) } },
  })

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        xp: newXp + achievementXp,
        level: newLevel,
        streakCurrent: streakUpdate.streakCurrent,
        streakBest: streakUpdate.streakBest,
        freezeCount: streakUpdate.freezeCount,
        lastStudiedAt: new Date(),
      },
    }),
    db.studySession.update({
      where: { id: sessionId },
      data: { endedAt: new Date(), xpGained, bestCombo },
    }),
    ...achievementDefs.map(ach =>
      db.userAchievement.create({ data: { userId, achievementId: ach.id } })
    ),
  ])

  const xpToday = priorXpToday + xpGained + achievementXp
  return NextResponse.json({
    xpGained: xpGained + achievementXp,
    xpBreakdown: breakdown,
    newAchievements: newAchievements.map(a => ({ slug: a.slug, name: a.name, icon: a.icon })),
    streakCurrent: streakUpdate.streakCurrent,
    freezesUsed: streakUpdate.freezesUsed,
    freezeCount: streakUpdate.freezeCount,
    dailyGoal: { goal: user.dailyGoalXp, xpToday, reached: xpToday >= user.dailyGoalXp },
    leveledUp: newLevel > oldLevel,
    newLevel,
  })
}
