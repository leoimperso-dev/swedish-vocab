import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, xpToNextLevel } from '@/lib/xp'
import { asLang, getStrings } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/AppShell'
import { Card, CardTitle, Chip, ProgressBar, SectionLabel } from '@/components/ui/primitives'
import { BookOpen, CheckCircle2, Target, Flame } from 'lucide-react'

const MASTERY_MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000]

// The vocabulary size changes rarely — memoize per lambda for an hour
let vocabTotalCache: { value: number; at: number } | null = null
async function getVocabTotal(): Promise<number> {
  if (vocabTotalCache && Date.now() - vocabTotalCache.at < 3600000) return vocabTotalCache.value
  const value = await db.word.count()
  vocabTotalCache = { value, at: Date.now() }
  return value
}

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
      getVocabTotal(),
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

  const overviewCards = [
    { label: t.wordsSeen, value: totalWords, sub: t.toReviewSub(dueCount), icon: BookOpen, tone: 'text-info' },
    {
      label: t.mastered,
      value: `${masteredPct}%`,
      sub: t.wordsSub(masteredCount),
      icon: CheckCircle2,
      tone: 'text-success',
    },
    {
      label: t.accuracy30d,
      value: `${accuracy}%`,
      sub: t.answersSub(totalAnswers),
      icon: Target,
      tone: 'text-accent',
    },
    {
      label: t.currentStreak,
      value: user.streakCurrent,
      sub: t.recordSub(user.streakBest),
      icon: Flame,
      tone: 'text-streak',
    },
  ]

  return (
    <AppShell title={t.statsTitle}>
      <div className="space-y-4">
        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-3">
          {overviewCards.map(c => (
            <Card key={c.label} className="p-3.5">
              <c.icon size={18} className={c.tone} />
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">{c.sub}</p>
            </Card>
          ))}
        </div>

        {/* Global progress: known words vs entire vocabulary */}
        <Card>
          <CardTitle>{t.globalProgress}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t.knownOf(masteredCount, vocabTotal)}</p>
          <ProgressBar
            className="mt-3"
            value={Math.min((masteredCount / Math.max(vocabTotal, 1)) * 100, 100)}
            tone="primary"
          />
        </Card>

        {/* Mastery milestone */}
        {nextMilestone && (
          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t.nextMilestone}</CardTitle>
              <Chip tone="success">{t.milestoneWords(masteredCount, nextMilestone)}</Chip>
            </div>
            <ProgressBar
              className="mt-3"
              value={Math.min((masteredCount / nextMilestone) * 100, 100)}
              tone="success"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t.masteredDef}</p>
          </Card>
        )}

        {/* Level progress */}
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle className="font-display text-lg">{level.title}</CardTitle>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {user.xp} XP total
            </span>
          </div>
          <ProgressBar className="mt-3" value={Math.min(progress * 100, 100)} tone="xp" />
        </Card>

        {/* 7-day activity chart */}
        <Card>
          <CardTitle>{t.activity7d}</CardTitle>
          <div className="mt-4 flex h-28 items-end gap-2">
            {weekActivity.map((day, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-muted-foreground">{day.xp || ''}</span>
                <div
                  className={cn(
                    'w-full rounded-t-md transition-[height] duration-300',
                    day.wordsStudied > 0 ? 'bg-gradient-xp' : 'bg-surface-raised',
                  )}
                  style={{ height: `${Math.max(6, (day.wordsStudied / maxWords) * 80)}px` }}
                />
                <span className="text-[10px] text-muted-foreground">{day.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Streak calendar — last 30 days */}
        <Card>
          <CardTitle>{t.streak30d}</CardTitle>
          <div className="mt-3 grid grid-cols-10 gap-1.5">
            {Array.from({ length: 30 }).map((_, i) => {
              const dayOffset = 29 - i
              const day = new Date(now.getTime() - dayOffset * 86400000)
              const dayStr = day.toISOString().split('T')[0]
              const studied = recentSessions.some(s => s.startedAt.toISOString().startsWith(dayStr))
              return (
                <span
                  key={i}
                  title={dayStr}
                  className={cn('aspect-square rounded-[5px]', studied ? 'bg-success' : 'bg-surface-raised')}
                />
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            <span>{t.statsHeatLess}</span>
            <span className="size-2.5 rounded-[3px] bg-surface-raised" />
            <span className="size-2.5 rounded-[3px] bg-success" />
            <span>{t.statsHeatMore}</span>
          </div>
        </Card>

        {/* Hardest words */}
        {hardestWords.length > 0 && (
          <div>
            <SectionLabel>{t.hardestWords}</SectionLabel>
            <div className="mt-2 space-y-2">
              {hardestWords.map(uw => (
                <Card key={uw.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-semibold">{uw.word.swedish}</p>
                    <p className="truncate text-xs text-muted-foreground">{uw.word.french}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-danger">
                    ✗ {uw.incorrectCount}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-success">
                    ✓ {uw.correctCount}
                  </span>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <div>
            <SectionLabel>{t.badgesEarned(achievements.length)}</SectionLabel>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {achievements.map(ua => (
                <Card key={ua.id} className="flex flex-col items-center gap-1 p-3 text-center">
                  <span className="text-2xl">{ua.achievement.icon}</span>
                  <span className="w-full truncate text-[11px] text-muted-foreground">{ua.achievement.name}</span>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
