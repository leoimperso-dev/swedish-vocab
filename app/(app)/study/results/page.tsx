'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import {
  Check,
  Minus,
  X,
  Flame,
  Snowflake,
  Target,
  Zap,
  ArrowUpCircle,
  Award,
  RotateCcw,
  Home,
} from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { Card, CardTitle, Chip, SectionLabel } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'

interface SessionData {
  xpGained: number
  newAchievements: Array<{ slug: string; name: string; icon: string }>
  streakCurrent: number
  freezesUsed?: number
  dailyGoal?: { goal: number; xpToday: number; reached: boolean }
  leveledUp: boolean
  newLevel: number
  results: string[]
}

// Score circle tint by performance tier
const scoreToneClasses = {
  success: 'border-success/40 bg-success-soft text-success',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  danger: 'border-danger/40 bg-danger-soft text-danger',
} as const

function ResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = getStrings(useLang())
  const data: SessionData = JSON.parse(decodeURIComponent(searchParams.get('data') ?? '{}'))

  const correct = data.results?.filter(r => r === 'correct').length ?? 0
  const approx = data.results?.filter(r => r === 'approximate').length ?? 0
  const incorrect = data.results?.filter(r => r === 'incorrect').length ?? 0
  const total = data.results?.length ?? 0
  const score = Math.round(((correct + approx * 0.5) / Math.max(total, 1)) * 100)

  const scoreTone = score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger'
  const counters = [
    { label: t.correct, value: correct, tone: 'text-success', Icon: Check },
    { label: t.almost, value: approx, tone: 'text-warning', Icon: Minus },
    { label: t.incorrect, value: incorrect, tone: 'text-danger', Icon: X },
  ]

  // pb-28 like AppShell: the bottom nav is fixed over this page too, and pb-12
  // left the last button half under it on a phone
  return (
    <main className="mx-auto min-h-dvh max-w-[430px] px-4 pb-28 pt-10">
      <div className="animate-rise space-y-4">
        {/* Score circle */}
        <div className="text-center">
          <div
            className={`mx-auto grid size-28 place-items-center rounded-full border-4 ${scoreToneClasses[scoreTone]}`}
          >
            <span className="font-display text-4xl font-semibold tabular-nums">{score}%</span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            {t.sessionDone}
          </h1>
          <p className="text-sm text-muted-foreground">{t.sessionWordsReviewed(total)}</p>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {counters.map(c => (
            <Card key={c.label} className="p-3 text-center">
              <c.Icon size={16} className={`mx-auto ${c.tone}`} />
              <p className="mt-1.5 font-display text-xl font-semibold tabular-nums">{c.value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{c.label}</p>
            </Card>
          ))}
        </div>

        {/* XP gained */}
        <Card className="border-warning/30 bg-warning-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SectionLabel className="text-warning">{t.xpGainedLabel}</SectionLabel>
              <p className="font-display text-3xl font-semibold text-warning">
                +{data.xpGained} XP
              </p>
            </div>
            {data.leveledUp ? (
              <Chip tone="warning">
                <ArrowUpCircle size={13} /> {t.levelUnlocked(data.newLevel)}
              </Chip>
            ) : null}
          </div>
        </Card>

        {/* Streak */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <Flame size={16} className="text-streak" /> {t.streak}
            </span>
            <span className="text-sm font-semibold">
              {data.streakCurrent} {t.streakDays}
            </span>
          </div>
          {(data.freezesUsed ?? 0) > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-freeze/25 bg-freeze-soft p-3">
              <Snowflake size={14} className="mt-0.5 shrink-0 text-freeze" />
              <p className="text-xs text-foreground/85">{t.freezeSaved}</p>
            </div>
          ) : null}
          {data.dailyGoal ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm">
                <Target size={16} className="text-success" /> {t.dailyGoal}
              </span>
              {data.dailyGoal.reached ? (
                <Chip tone="success">
                  <Zap size={13} /> {data.dailyGoal.xpToday}/{data.dailyGoal.goal} XP
                </Chip>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {data.dailyGoal.xpToday}/{data.dailyGoal.goal} XP
                </span>
              )}
            </div>
          ) : null}
        </Card>

        {/* New achievements */}
        {data.newAchievements?.length > 0 ? (
          <Card>
            <CardTitle>{t.newBadges}</CardTitle>
            <div className="mt-3 space-y-2">
              {data.newAchievements.map(a => (
                <div key={a.slug} className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                    <Award size={18} />
                  </span>
                  <p className="truncate font-display text-sm font-semibold">{a.name}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <Button onClick={() => router.push('/study')} size="lg" className="w-full">
            <RotateCcw size={18} /> {t.newSession}
          </Button>
          <Button
            onClick={() => router.push('/dashboard')}
            variant="secondary"
            size="lg"
            className="w-full"
          >
            <Home size={18} /> {t.backHome}
          </Button>
        </div>
      </div>
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  )
}
