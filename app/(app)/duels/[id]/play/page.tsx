'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Swords, Timer } from 'lucide-react'
import MultipleChoice from '@/components/study/MultipleChoice'
import TypingExercise from '@/components/study/TypingExercise'
import ConjugationExercise from '@/components/study/ConjugationExercise'
import ClozeExercise from '@/components/study/ClozeExercise'
import ListeningExercise from '@/components/study/ListeningExercise'
import { AppShell } from '@/components/AppShell'
import { Card, ProgressBar } from '@/components/ui/primitives'
import { buttonClasses } from '@/components/ui/button'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { BLITZ_SECONDS, scoreAnswer, type DuelMode } from '@/lib/duel/rules'
import { cn } from '@/lib/utils'
import type { AnswerResult, ExerciseWord } from '@/types'
import type { Direction } from '@/lib/courses'

interface RoundData {
  sessionId: string
  round: number
  mode: DuelMode
  direction: Direction
  exercises: ExerciseWord[]
}

interface SubmittedAnswer {
  wordId: string
  result: AnswerResult
  msLeft: number
}

interface RoundResult {
  resolved: boolean
  roundWinnerId: string | null
  duelFinished: boolean
  yourScore: number
  theirScore: number | null
}

export default function PlayRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = getStrings(useLang())
  const router = useRouter()
  const [data, setData] = useState<RoundData | null>(null)
  const [error, setError] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<SubmittedAnswer[]>([])
  const [outcome, setOutcome] = useState<RoundResult | null>(null)
  const [sending, setSending] = useState(false)
  // Running score, shown live — it is recomputed server-side on submit
  const [score, setScore] = useState(0)

  useEffect(() => {
    fetch(`/api/duels/${id}/round`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [id])

  const submit = useCallback(
    async (all: SubmittedAnswer[], sessionId: string) => {
      setSending(true)
      try {
        const res = await fetch(`/api/duels/${id}/round`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, answers: all }),
        })
        setOutcome(await res.json())
        // The nav badge and the header XP live in the (app) layout
        router.refresh()
      } catch {
        setError(true)
      }
      setSending(false)
    },
    [id, router],
  )

  // An exercise takes exactly one answer. In blitz the clock can run out while
  // the learner is still reading the correction of the answer they just gave —
  // without this, that exercise would be scored twice.
  const answeredIndex = useRef(-1)

  const handleAnswer = useCallback(
    (result: AnswerResult, msLeft: number) => {
      if (!data) return
      const word = data.exercises[index]?.word
      if (!word || answeredIndex.current === index) return
      answeredIndex.current = index

      const streak = result === 'correct' ? consecutiveCorrect(answers) + 1 : 0
      setScore(s => s + scoreAnswer(data.mode, result, { streak, msLeft }))

      const all = [...answers, { wordId: word.id, result, msLeft }]
      setAnswers(all)
      if (all.length >= data.exercises.length) submit(all, data.sessionId)
      else setIndex(i => i + 1)
    },
    [data, index, answers, submit],
  )

  if (error) {
    return (
      <AppShell title={t.duelsTitle}>
        <Link href={`/duels/${id}`} className={buttonClasses({ variant: 'secondary', className: 'w-full' })}>
          {t.duelBack}
        </Link>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="space-y-4 text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">{t.duelPreparingRound}</p>
        </div>
      </main>
    )
  }

  if (outcome || sending) {
    return <RoundSummary duelId={id} outcome={outcome} />
  }

  const current = data.exercises[index]

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] pb-28">
      <header className="safe-top sticky top-0 z-40 space-y-2 border-b border-border/70 bg-background/85 px-4 pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Swords size={14} /> {t.duelRoundOf(index + 1, data.exercises.length)}
          </span>
          <span className="font-display text-sm font-semibold tabular-nums text-accent">
            {t.duelPoints(score)}
          </span>
        </div>
        <ProgressBar value={(index / data.exercises.length) * 100} />
      </header>

      <main key={index} className="animate-rise px-4 pt-5">
        {data.mode === 'BLITZ' ? (
          <BlitzTimer
            key={index}
            onExpire={() => handleAnswer('incorrect', 0)}
            label={t.duelTimeUp}
            render={msLeft => (
              <Exercise exercise={current} direction={data.direction} onAnswer={r => handleAnswer(r, msLeft)} />
            )}
          />
        ) : (
          <Exercise exercise={current} direction={data.direction} onAnswer={r => handleAnswer(r, 0)} />
        )}
      </main>
    </div>
  )
}

/** Consecutive correct answers at the end of the list. */
function consecutiveCorrect(answers: SubmittedAnswer[]): number {
  let streak = 0
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i].result !== 'correct') break
    streak++
  }
  return streak
}

function Exercise({
  exercise,
  direction,
  onAnswer,
}: {
  exercise: ExerciseWord
  direction: Direction
  onAnswer: (result: AnswerResult) => void
}) {
  const { word, exerciseType, distractors, alsoAccepted } = exercise
  const answer = (result: AnswerResult) => onAnswer(result)

  // No flashcard here: a duel score cannot rest on self-assessment
  switch (exerciseType) {
    case 'QCM':
      return <MultipleChoice word={word} direction={direction} distractors={distractors} onAnswer={answer} />
    case 'TYPING':
      return <TypingExercise word={word} direction={direction} alsoAccepted={alsoAccepted} onAnswer={answer} />
    case 'CONJUGATION':
      return <ConjugationExercise word={word} onAnswer={answer} />
    case 'CLOZE':
      return <ClozeExercise word={word} alsoAccepted={alsoAccepted} onAnswer={answer} />
    case 'LISTENING':
      return <ListeningExercise word={word} onAnswer={answer} />
    default:
      return <MultipleChoice word={word} direction={direction} distractors={distractors} onAnswer={answer} />
  }
}

/**
 * Blitz clock. The deadline is a ref, so reading the remaining time on answer
 * costs no re-render; the bar redraws on its own ticks.
 */
function BlitzTimer({
  onExpire,
  label,
  render,
}: {
  onExpire: () => void
  label: string
  /** Milliseconds left, refreshed every 100ms — precise enough for a speed bonus. */
  render: (msLeft: number) => React.ReactNode
}) {
  const total = BLITZ_SECONDS * 1000
  // The clock starts when the exercise mounts, not when it was rendered
  const deadline = useRef(0)
  const [left, setLeft] = useState(total)
  const expired = useRef(false)
  const expire = useRef(onExpire)

  useEffect(() => {
    expire.current = onExpire
  })

  useEffect(() => {
    deadline.current = Date.now() + total
    const tick = setInterval(() => {
      const remaining = deadline.current - Date.now()
      setLeft(Math.max(0, remaining))
      if (remaining <= 0 && !expired.current) {
        expired.current = true
        clearInterval(tick)
        expire.current()
      }
    }, 100)
    return () => clearInterval(tick)
  }, [total])

  const seconds = Math.ceil(left / 1000)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Timer size={14} className={cn(seconds <= 3 ? 'text-danger' : 'text-muted-foreground')} />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-100 ease-linear',
              seconds <= 3 ? 'bg-danger' : 'bg-accent',
            )}
            style={{ width: `${(left / total) * 100}%` }}
          />
        </div>
        <span
          className={cn(
            'w-8 text-right font-display text-sm font-semibold tabular-nums',
            seconds <= 3 ? 'text-danger' : 'text-muted-foreground',
          )}
        >
          {left === 0 ? label : `${seconds}s`}
        </span>
      </div>
      {render(left)}
    </div>
  )
}

function RoundSummary({ duelId, outcome }: { duelId: string; outcome: RoundResult | null }) {
  const t = getStrings(useLang())

  if (!outcome) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </main>
    )
  }

  const verdict = !outcome.resolved
    ? t.duelRoundSent
    : outcome.theirScore === outcome.yourScore
      ? t.duelRoundTie
      : outcome.yourScore > (outcome.theirScore ?? 0)
        ? t.duelRoundWon
        : t.duelRoundLost

  return (
    <AppShell title={t.duelsTitle}>
      <div className="space-y-4">
        <Card className="space-y-2 py-6 text-center">
          <p className="font-display text-5xl font-semibold tabular-nums text-accent">
            {outcome.yourScore}
          </p>
          <p className="text-sm text-muted-foreground">{t.duelYourScore}</p>
          {outcome.resolved ? (
            <p className="pt-2 font-display text-base font-semibold">
              {verdict} · {t.duelPoints(outcome.theirScore ?? 0)}
            </p>
          ) : (
            <p className="pt-2 text-sm text-muted-foreground">{t.duelHiddenScore}</p>
          )}
        </Card>

        <Link href={`/duels/${duelId}`} className={buttonClasses({ size: 'lg', className: 'w-full' })}>
          {t.duelBack}
        </Link>
      </div>
    </AppShell>
  )
}
