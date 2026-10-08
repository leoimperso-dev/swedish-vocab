import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, getNextLevel, levelTitle, xpToNextLevel } from '@/lib/xp'
import { toLocalDateString } from '@/lib/streak'
import { getStrings } from '@/lib/i18n'
import { getCourse } from '@/lib/current-course'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/AppShell'
import { PushBanner } from '@/components/PushBanner'
import { Card, CardTitle, Chip, ProgressBar, SectionLabel } from '@/components/ui/primitives'
import { buttonClasses } from '@/components/ui/button'
import Link from 'next/link'
import { Flame, Snowflake, Zap, Target, CheckCircle2, BookOpen, Trophy, ArrowRight } from 'lucide-react'

export default async function DashboardPage() {
  const session = await auth()
  const userId = session!.user!.id
  const course = await getCourse(userId)
  // Word counts are per course; XP, streak and level stay global
  const inCourse = { word: { pair: course.pair } }

  const [user, masteredCount] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      include: {
        wordProgress: {
          where: { ...inCourse, nextReview: { lte: new Date() } },
          select: { id: true },
        },
        studySessions: {
          where: { endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 36 * 3600000) } },
          select: { startedAt: true, xpGained: true },
        },
      },
    }),
    db.userWord.count({ where: { userId, ...inCourse, interval: { gt: 21 } } }),
  ])

  if (!user) return null

  const t = getStrings(course.native)
  const level = getLevelForXp(user.xp)
  const nextLevel = getNextLevel(level.level)
  const { current, needed, progress } = xpToNextLevel(user.xp)
  const dueCount = user.wordProgress.length

  const today = toLocalDateString(new Date(), user.timezone)
  const xpToday = user.studySessions
    .filter(s => toLocalDateString(s.startedAt, user.timezone) === today)
    .reduce((sum, s) => sum + s.xpGained, 0)
  const goalReached = xpToday >= user.dailyGoalXp
  const goalProgress = Math.min((xpToday / user.dailyGoalXp) * 100, 100)

  const stats = [
    { label: t.toReview, value: dueCount, icon: Target, tone: 'text-info' },
    { label: t.masteredWords, value: masteredCount, icon: CheckCircle2, tone: 'text-success' },
    { label: t.totalXp, value: user.xp, icon: Zap, tone: 'text-warning' },
    { label: t.bestStreak, value: user.streakBest, icon: Trophy, tone: 'text-streak' },
  ]

  return (
    <AppShell
      title={`${t.hello} ${user.name?.split(' ')[0]}`}
      subtitle={t.dashboardSubtitle(t.languageName[course.learned])}
    >
      <div className="space-y-4">
        <PushBanner />

        {/* Objectif du jour */}
        <Card className={goalReached ? 'border-success/30 bg-success-soft' : undefined}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionLabel className={goalReached ? 'text-success' : undefined}>
                {t.dailyGoal}
              </SectionLabel>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {xpToday}
                <span className="text-muted-foreground">/{user.dailyGoalXp} XP</span>
              </p>
            </div>
            {goalReached ? (
              <Chip tone="success">
                <CheckCircle2 size={13} /> {t.goalReached}
              </Chip>
            ) : null}
          </div>
          <ProgressBar value={goalProgress} tone="success" className="mt-3" />
        </Card>

        {/* Niveau */}
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="font-display text-lg">{levelTitle(level, course.learned)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t.level} {level.level}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-warning">
              {user.xp} XP
            </span>
          </div>
          <ProgressBar value={Math.min(progress * 100, 100)} tone="xp" className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">
            {t.xpBeforeLevel(needed - current, levelTitle(nextLevel, course.learned))}
          </p>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <Card key={s.label} className="p-3.5">
              <s.icon size={16} className={s.tone} />
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <Link href="/study" className={buttonClasses({ size: 'lg', className: 'w-full' })}>
          {dueCount > 0 ? t.studyDue(dueCount) : t.studyNew} <ArrowRight size={18} />
        </Link>

        <Link
          href="/study"
          className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}
        >
          <BookOpen size={18} /> {t.chooseExercise}
        </Link>

        {/* Activité récente */}
        <Card>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t.recentActivity}</CardTitle>
            <div className="flex items-center gap-1.5">
              <Chip tone="streak">
                <Flame size={13} /> {user.streakCurrent}
              </Chip>
              {user.freezeCount > 0 ? (
                <Chip tone="freeze">
                  <Snowflake size={13} /> ×{user.freezeCount}
                </Chip>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-10 gap-1.5">
            {Array.from({ length: 30 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'aspect-square rounded-md',
                  i < user.streakCurrent ? 'bg-success' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
