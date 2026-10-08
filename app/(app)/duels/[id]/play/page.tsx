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
import { Button, buttonClasses } from '@/components/ui/button'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { blitzSeconds, scoreAnswer, type DuelMode } from '@/lib/duel/rules'
import { cn } from '@/lib/utils'
import type { AnswerResult, ExerciseType, ExerciseWord } from '@/types'
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
  // Blitz flips the direction per exercise, so SM-2 has to be told which one
  // this answer belongs to rather than assuming the round's
  direction: Direction
  // Each type has its own blitz clock, so msLeft is meaningless without it
  exerciseType: ExerciseType
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
        // A refused submission (the duel ended, or the turn moved on while this
        // round was being played) carries an `error`, not a score — rendering it
        // as a summary would show an empty scoreboard instead of saying why.
        if (!res.ok) {
          setError(true)
          return
        }
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
  // Set the moment the answer is graded, well before the exercise hands over:
  // a correct answer waits for the word to be spoken in full, and a wrong one
  // waits for the learner to press "next". The clock stops here, so neither
  // costs points — and the score is shown right away.
  const settled = useRef<{ points: number; msLeft: number } | null>(null)
  const [earned, setEarned] = useState<number | null>(null)
  const [pendingResult, setPendingResult] = useState<AnswerResult | null>(null)
  // Reset when moving to the next exercise
  useEffect(() => { setPendingResult(null) }, [index])

  const handleSubmitted = useCallback(
    (result: AnswerResult, msLeft: number) => {
      if (!data || settled.current || answeredIndex.current === index) return
      const exercise = data.exercises[index]
      if (!exercise) return
      const streak = result === 'correct' ? consecutiveCorrect(answers) + 1 : 0
      const points = scoreAnswer(data.mode, result, {
        streak, msLeft, exerciseType: exercise.exerciseType,
      })
      settled.current = { points, msLeft }
      setScore(s => s + points)
      setEarned(points)
    },
    [data, index, answers],
  )

  const handleAnswer = useCallback(
    (result: AnswerResult, liveMsLeft: number) => {
      if (!data) return
      const exercise = data.exercises[index]
      if (!exercise || answeredIndex.current === index) return
      answeredIndex.current = index

      // The clock as it stood when the answer was given. Only a timeout — where
      // nothing was ever submitted — falls back to the live reading.
      const msLeft = settled.current?.msLeft ?? liveMsLeft
      const exerciseType = exercise.exerciseType
      if (!settled.current) {
        const streak = result === 'correct' ? consecutiveCorrect(answers) + 1 : 0
        setScore(s => s + scoreAnswer(data.mode, result, { streak, msLeft, exerciseType }))
      }
      settled.current = null
      setEarned(null)

      const all = [
        ...answers,
        {
          wordId: exercise.word.id,
          result,
          msLeft,
          direction: exercise.direction ?? data.direction,
          exerciseType,
        },
      ]
      setAnswers(all)
      if (all.length >= data.exercises.length) submit(all, data.sessionId)
      else setIndex(i => i + 1)
    },
    [data, index, answers, submit],
  )

  if (error) {
    return (
      <AppShell title={t.duelsTitle}>
        <div className="space-y-4">
          <Card>
            <p className="text-sm text-muted-foreground">{t.duelRoundUnavailable}</p>
          </Card>
          <Link href={`/duels/${id}`} className={buttonClasses({ variant: 'secondary', className: 'w-full' })}>
            {t.duelBack}
          </Link>
        </div>
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
          <span className="relative flex items-center gap-2">
            <span className="font-display text-sm font-semibold tabular-nums text-accent">
              {t.duelPoints(score)}
            </span>
            {/* What the answer just scored — the clock stopped when it was given */}
            {earned !== null && (
              <span
                key={index}
                className={cn(
                  'animate-pop rounded-lg px-2 py-0.5 font-display text-sm font-semibold tabular-nums',
                  earned > 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                )}
              >
                +{earned}
              </span>
            )}
          </span>
        </div>
        <ProgressBar value={(index / data.exercises.length) * 100} />
      </header>

      <main key={index} className="animate-rise px-4 pt-5">
        {data.mode === 'BLITZ' ? (
          <BlitzTimer
            key={index}
            seconds={blitzSeconds(current.exerciseType)}
            frozen={earned !== null}
            onExpire={() => handleAnswer('incorrect', 0)}
            label={t.duelTimeUp}
            render={msLeft => (
              <Exercise
                exercise={current}
                fallbackDirection={data.direction}
                onSubmitted={r => handleSubmitted(r, msLeft)}
                onAnswer={r => handleAnswer(r, msLeft)}
              />
            )}
          />
        ) : (
          <div className="space-y-4">
            <Exercise
              exercise={current}
              fallbackDirection={data.direction}
              onSubmitted={r => { handleSubmitted(r, 0); setPendingResult(r) }}
              onAnswer={r => handleAnswer(r, 0)}
              manualNext
            />
            {pendingResult !== null && (
              <Button size="lg" className="w-full" onClick={() => handleAnswer(pendingResult, 0)}>
                {t.nextTurn}
              </Button>
            )}
          </div>
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
  fallbackDirection,
  onAnswer,
  onSubmitted,
  manualNext,
}: {
  exercise: ExerciseWord
  fallbackDirection: Direction
  onAnswer: (result: AnswerResult) => void
  /** Fired when the answer is graded, before its correction is shown */
  onSubmitted: (result: AnswerResult) => void
  manualNext?: boolean
}) {
  const { word, exerciseType, distractors, alsoAccepted } = exercise
  // Blitz asks some questions the other way round — see lib/study/build.ts
  const direction = exercise.direction ?? fallbackDirection
  const answer = (result: AnswerResult) => onAnswer(result)

  // No flashcard here: a duel score cannot rest on self-assessment
  switch (exerciseType) {
    case 'QCM':
      return <MultipleChoice word={word} direction={direction} distractors={distractors} onAnswer={answer} onSubmitted={onSubmitted} manualNext={manualNext} />
    case 'TYPING':
      return <TypingExercise word={word} direction={direction} alsoAccepted={alsoAccepted} onAnswer={answer} onSubmitted={onSubmitted} manualNext={manualNext} />
    case 'CONJUGATION':
      return <ConjugationExercise word={word} onAnswer={answer} onSubmitted={onSubmitted} manualNext={manualNext} />
    case 'CLOZE':
      return <ClozeExercise word={word} alsoAccepted={alsoAccepted} onAnswer={answer} onSubmitted={onSubmitted} manualNext={manualNext} />
    case 'LISTENING':
      return <ListeningExercise word={word} onAnswer={answer} onSubmitted={onSubmitted} manualNext={manualNext} />
    default:
      return <MultipleChoice word={word} direction={direction} distractors={distractors} onAnswer={answer} onSubmitted={onSubmitted} manualNext={manualNext} />
  }
}

/**
 * Blitz clock. The deadline is a ref, so reading the remaining time on answer
 * costs no re-render; the bar redraws on its own ticks.
 */
function BlitzTimer({
  seconds,
  frozen,
  onExpire,
  label,
  render,
}: {
  /** This exercise's budget — a dictation gets more than a QCM, see BLITZ_SECONDS. */
  seconds: number
  /**
   * Stop the clock: the answer has been given and is being corrected. Without
   * this, reading a correction — or simply waiting for the word to be spoken in
   * full — kept draining the speed bonus, and a slow readout could even expire
   * the exercise the learner had just answered correctly.
   */
  frozen: boolean
  onExpire: () => void
  label: string
  /** Milliseconds left, refreshed every 100ms — precise enough for a speed bonus. */
  render: (msLeft: number) => React.ReactNode
}) {
  const total = seconds * 1000
  // The clock starts when the exercise mounts, not when it was rendered
  const deadline = useRef(0)
  const [left, setLeft] = useState(total)
  const expired = useRef(false)
  const expire = useRef(onExpire)

  useEffect(() => {
    expire.current = onExpire
  })

  const stopped = useRef(frozen)
  useEffect(() => {
    stopped.current = frozen
  })

  useEffect(() => {
    deadline.current = Date.now() + total
    const tick = setInterval(() => {
      if (stopped.current) return
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

  const secondsLeft = Math.ceil(left / 1000)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Timer size={14} className={cn(secondsLeft <= 3 ? 'text-danger' : 'text-muted-foreground')} />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-100 ease-linear',
              secondsLeft <= 3 ? 'bg-danger' : 'bg-accent',
            )}
            style={{ width: `${(left / total) * 100}%` }}
          />
        </div>
        <span
          className={cn(
            'w-8 text-right font-display text-sm font-semibold tabular-nums',
            secondsLeft <= 3 ? 'text-danger' : 'text-muted-foreground',
          )}
        >
          {left === 0 ? label : `${secondsLeft}s`}
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
