// Closing a study session: XP, streak, achievements, daily goal. A duel round
// is played as a normal session, so it finalizes through here too — the only
// difference is the extra XP a duel can add on top.
import { db } from '@/lib/db'
import { calculateSessionXp, getLevelForXp } from '@/lib/xp'
import { toLocalDateString } from '@/lib/streak'
import { checkNewAchievements } from '@/lib/achievements'
import type { AnswerResult } from '@/types'

export interface SessionOutcome {
  xpGained: number
  xpBreakdown: { base: number; combo: number; bonus: number }
  newAchievements: Array<{ slug: string; name: string; icon: string }>
  streakCurrent: number
  freezesUsed: number
  freezeCount: number
  dailyGoal: { goal: number; xpToday: number; reached: boolean }
  leveledUp: boolean
  newLevel: number
}

export async function finalizeSession(
  userId: string,
  sessionId: string,
  results: AnswerResult[],
  bestCombo: number,
  /** Duel bonus — counted as session XP, so it feeds the level and the daily goal. */
  extraXp = 0,
): Promise<SessionOutcome | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { achievements: { include: { achievement: true } } },
  })
  if (!user) return null

  // The streak belongs to the app layout now — it counts days the learner
  // showed up, which a session cannot know about. Still needed here: whether
  // this is the day's first session, which is what carries the XP bonus.
  const isFirstStudyOfDay =
    !user.lastStudiedAt ||
    toLocalDateString(user.lastStudiedAt, user.timezone) !== toLocalDateString(new Date(), user.timezone)

  // XP
  const { total: sessionXp, breakdown } = calculateSessionXp(results, isFirstStudyOfDay)
  const xpGained = sessionXp + extraXp
  const newXp = user.xp + xpGained
  const oldLevel = user.level
  const newLevel = getLevelForXp(newXp).level

  // Achievements — word counts are per distinct word (directions don't double-count)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const [studiedRows, masteredVerbRows, todayRows] = await Promise.all([
    db.userWord.findMany({ where: { userId }, select: { wordId: true }, distinct: ['wordId'] }),
    db.userWord.findMany({
      where: { userId, interval: { gt: 21 }, word: { wordType: 'VERB' } },
      select: { wordId: true },
      distinct: ['wordId'],
    }),
    db.userWord.findMany({
      where: { userId, lastStudied: { gte: todayStart } },
      select: { wordId: true },
      distinct: ['wordId'],
    }),
  ])

  const unlockedSlugs = user.achievements.map(ua => ua.achievement.slug)
  const newAchievements = checkNewAchievements(unlockedSlugs, {
    totalWordsStudied: studiedRows.length,
    streakCurrent: user.streakCurrent,
    wordsStudiedToday: todayRows.length,
    masteredVerbCount: masteredVerbRows.length,
    sessionPerfect: results.every(r => r === 'correct') && results.length >= 15,
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
  return {
    xpGained: xpGained + achievementXp,
    xpBreakdown: breakdown,
    newAchievements: newAchievements.map(a => ({ slug: a.slug, name: a.name, icon: a.icon })),
    // Settled when the app was opened, not here — reported so the results
    // screen can show the day's standing
    streakCurrent: user.streakCurrent,
    freezesUsed: 0,
    freezeCount: user.freezeCount,
    dailyGoal: { goal: user.dailyGoalXp, xpToday, reached: xpToday >= user.dailyGoalXp },
    leveledUp: newLevel > oldLevel,
    newLevel,
  }
}
