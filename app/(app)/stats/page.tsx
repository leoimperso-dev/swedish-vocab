import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, xpToNextLevel } from '@/lib/xp'
import { asLang, getStrings } from '@/lib/i18n'

const MASTERY_MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000]

export default async function StatsPage() {
  const session = await auth()
  const userId = session!.user!.id
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  const [user, seenRows, masteredRows, dueCount, recentSessions, hardestWords, achievements, vocabTotal] =
    await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.userWord.findMany({ where: { userId }, select: { wordId: true }, distinct: ['wordId'] }),
      db.userWord.findMany({
        where: { userId, interval: { gt: 21 } },
        select: { wordId: true },
        distinct: ['wordId'],
      }),
      db.userWord.count({ where: { userId, nextReview: { lte: now } } }),
      db.studySession.findMany({
        where: { userId, startedAt: { gte: thirtyDaysAgo }, endedAt: { not: null } },
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true, wordsStudied: true, wordsCorrect: true, xpGained: true },
      }),
      db.userWord.findMany({
        where: { userId, incorrectCount: { gt: 0 } },
        orderBy: { incorrectCount: 'desc' },
        take: 10,
        include: { word: { select: { swedish: true, french: true } } },
      }),
      db.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
      }),
      db.word.count(),
    ])

  if (!user) return null

  const totalWords = seenRows.length
  const masteredCount = masteredRows.length
  const lang = asLang(user.nativeLanguage)
  const t = getStrings(lang)
  const level = getLevelForXp(user.xp)
  const { progress } = xpToNextLevel(user.xp)

  // 7-day activity
  const weekActivity = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now.getTime() - (6 - i) * 86400000)
    const dayStr = day.toISOString().split('T')[0]
    const label = day.toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'fr-FR', { weekday: 'short' })
    const sessions = recentSessions.filter(s => s.startedAt.toISOString().startsWith(dayStr))
    return {
      label,
      wordsStudied: sessions.reduce((sum, s) => sum + s.wordsStudied, 0),
      xp: sessions.reduce((sum, s) => sum + s.xpGained, 0),
    }
  })

  const maxWords = Math.max(...weekActivity.map(d => d.wordsStudied), 1)

  const totalAnswers = recentSessions.reduce((sum, s) => sum + s.wordsStudied, 0)
  const correctAnswers = recentSessions.reduce((sum, s) => sum + s.wordsCorrect, 0)
  const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0
  const masteredPct = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0
  const nextMilestone = MASTERY_MILESTONES.find(m => m > masteredCount) ?? null

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t.statsTitle}</h1>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t.wordsSeen} value={totalWords} sub={t.toReviewSub(dueCount)} color="text-blue-400" />
        <StatCard label={t.mastered} value={`${masteredPct}%`} sub={t.wordsSub(masteredCount)} color="text-green-400" />
        <StatCard label={t.accuracy30d} value={`${accuracy}%`} sub={t.answersSub(totalAnswers)} color="text-yellow-400" />
        <StatCard label={t.currentStreak} value={`🔥 ${user.streakCurrent}`} sub={t.recordSub(user.streakBest)} color="text-orange-400" />
      </div>

      {/* Global progress: known words vs entire vocabulary */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-300">{t.globalProgress}</span>
          <span className="text-blue-400 text-sm font-bold">{t.knownOf(masteredCount, vocabTotal)}</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${Math.min((masteredCount / Math.max(vocabTotal, 1)) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Mastery milestone */}
      {nextMilestone && (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-300">{t.nextMilestone}</span>
            <span className="text-green-400 text-sm font-bold">{t.milestoneWords(masteredCount, nextMilestone)}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${Math.min((masteredCount / nextMilestone) * 100, 100)}%` }}
            />
          </div>
          <p className="text-slate-500 text-xs">{t.masteredDef}</p>
        </div>
      )}

      {/* Level progress */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold">{level.title}</span>
          <span className="text-slate-400 text-sm">{user.xp} XP total</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
        </div>
      </div>

      {/* 7-day activity chart */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold text-slate-300">{t.activity7d}</h2>
        <div className="flex items-end gap-2 h-24">
          {weekActivity.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full relative flex items-end" style={{ height: '72px' }}>
                <div
                  className="w-full bg-blue-600 rounded-t-md transition-all duration-500"
                  style={{ height: `${(day.wordsStudied / maxWords) * 100}%`, minHeight: day.wordsStudied > 0 ? '4px' : '0' }}
                />
              </div>
              <span className="text-slate-500 text-xs">{day.label}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>{t.wordsPerDay}</span>
          <span>{t.max} : {maxWords}</span>
        </div>
      </div>

      {/* Streak calendar — last 30 days */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold text-slate-300">{t.streak30d}</h2>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 30 }).map((_, i) => {
            const dayOffset = 29 - i
            const day = new Date(now.getTime() - dayOffset * 86400000)
            const dayStr = day.toISOString().split('T')[0]
            const studied = recentSessions.some(s => s.startedAt.toISOString().startsWith(dayStr))
            return (
              <div
                key={i}
                title={dayStr}
                className={`w-7 h-7 rounded-md ${studied ? 'bg-orange-500' : 'bg-slate-800'}`}
              />
            )
          })}
        </div>
        <div className="flex gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded" /> {t.studied}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-800 rounded" /> {t.notStudied}</span>
        </div>
      </div>

      {/* Hardest words */}
      {hardestWords.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-300">{t.hardestWords}</h2>
          <div className="space-y-2">
            {hardestWords.map((uw, i) => (
              <div key={uw.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                <span className="text-slate-600 text-sm w-4">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-medium">{uw.word.swedish}</p>
                  <p className="text-slate-500 text-sm">{uw.word.french}</p>
                </div>
                <div className="text-right text-sm">
                  <span className="text-red-400">{uw.incorrectCount} ❌</span>
                  <span className="text-slate-600 ml-2">{uw.correctCount} ✅</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-300">{t.badgesEarned(achievements.length)}</h2>
          <div className="grid grid-cols-4 gap-3">
            {achievements.map(ua => (
              <div key={ua.id} className="flex flex-col items-center gap-1 text-center">
                <span className="text-3xl">{ua.achievement.icon}</span>
                <span className="text-xs text-slate-400">{ua.achievement.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-1">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-slate-600 text-xs">{sub}</p>
    </div>
  )
}
