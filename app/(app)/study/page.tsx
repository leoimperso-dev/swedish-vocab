'use client'

import { Component, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Shuffle, Layers, ListChecks, PenLine, TextCursorInput, Repeat2, Quote,
  BookOpen, Brain, ChevronRight, Sparkles, Loader2, PartyPopper, Ear, MessagesSquare,
  type LucideIcon,
} from 'lucide-react'
import FlashCard from '@/components/study/FlashCard'
import MultipleChoice from '@/components/study/MultipleChoice'
import TypingExercise from '@/components/study/TypingExercise'
import ConjugationExercise from '@/components/study/ConjugationExercise'
import ClozeExercise from '@/components/study/ClozeExercise'
import ListeningExercise from '@/components/study/ListeningExercise'
import SessionProgress from '@/components/study/SessionProgress'
import { AppShell } from '@/components/AppShell'
import { Card, Chip, SectionLabel, Segmented } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { getStrings } from '@/lib/i18n'
import { useCourse, useLang, useLevel } from '@/components/CourseProvider'
import { LevelPicker } from '@/components/LevelPicker'
import {
  courseDirections, defaultDirection, flagOf, learnsTermLanguage, promptLang, answerLang,
  type Course, type Direction, type DirectionChoice,
} from '@/lib/courses'
import type { ExerciseWord, AnswerResult, ExerciseType } from '@/types'
import { drawFromPool, fillPool, flushQueue, poolSize, queueAnswer } from '@/lib/offline/study'

// EXPRESSIONS is not an exercise type but a slice of the vocabulary: the same
// mixed session, drawn from the curated set phrases only
// Same length as a server-built session (see app/api/study/session/route.ts)
const OFFLINE_SESSION_SIZE = 15
// Two sessions left is the point where a refill is worth a request
const POOL_REFILL_BELOW = OFFLINE_SESSION_SIZE * 2

type StudyMode = 'MIX' | 'EXPRESSIONS' | ExerciseType

// Fisher-Yates on a copy — a replay in the order the words were missed lets the
// learner recite the sequence instead of recalling the words
function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function StudyPage() {
  const router = useRouter()
  const course = useCourse()
  const t = getStrings(course.native)
  const [mode, setMode] = useState<StudyMode | null>(null)
  // A language is never studied before its level is known — it decides which
  // new words the session draws from
  const declaredLevel = useLevel()
  const [levelAsked, setLevelAsked] = useState(false)
  const [direction, setDirection] = useState<DirectionChoice>(defaultDirection(course))
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseWord[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<AnswerResult[]>([])
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  // Words missed this round — offered as a replay before the results screen
  const [missed, setMissed] = useState<ExerciseWord[]>([])
  const [reviewingMissed, setReviewingMissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)
  // Set when the session came from the downloaded pool: its answers are queued
  // on the phone under this id and replayed as one session on reconnection
  const [offlineBatch, setOfflineBatch] = useState<string | null>(null)
  const [offlineDone, setOfflineDone] = useState(false)
  const [synced, setSynced] = useState(0)

  // Send what was answered offline, then top the pool back up. Both are
  // best-effort: a failure here must never block a session.
  useEffect(() => {
    const catchUp = async () => {
      if (!navigator.onLine) return
      const sent = await flushQueue().catch(() => 0)
      if (sent > 0) { setSynced(sent); router.refresh() }
      // Refilled before it runs dry, not once empty: the reconnection that
      // would have topped it up may not come before the next flight.
      if ((await poolSize(course.pair).catch(() => POOL_REFILL_BELOW)) >= POOL_REFILL_BELOW) return
      const res = await fetch(`/api/study/offline?direction=${direction}`)
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.exercises) && data.exercises.length > 0) {
        await fillPool(course.pair, defaultDirection(course), data.exercises)
      }
    }
    catchUp().catch(() => {})
    window.addEventListener('online', () => { catchUp().catch(() => {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.pair])

  useEffect(() => {
    if (!mode) return
    setLoading(true)
    const params = new URLSearchParams({ direction })
    if (mode === 'EXPRESSIONS') params.set('scope', 'expressions')
    else if (mode !== 'MIX') params.set('mode', mode)
    const start = async () => {
      try {
        const res = await fetch(`/api/study/session?${params}`)
        if (!res.ok) throw new Error('offline')
        const data = await res.json()
        setSessionId(data.sessionId ?? null)
        setExercises(Array.isArray(data.exercises) ? data.exercises : [])
        setOfflineBatch(null)
      } catch {
        // No network: play what was downloaded. Flashcards always work offline —
        // any word can be one — so that mode is honoured exactly; the others
        // are served from the pool as far as it allows.
        const forced = mode === 'MIX' || mode === 'EXPRESSIONS' ? null : mode
        const drawn = await drawFromPool(course.pair, OFFLINE_SESSION_SIZE, forced).catch(() => [])
        if (drawn.length === 0) { setMode(null); setLoading(false); return }
        setExercises(drawn)
        setSessionId(null)
        setOfflineBatch(`${course.pair}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      }
      setLoading(false)
    }
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Warn before accidental reload (pull-to-refresh) while a session is running
  const sessionActive = !!mode && !loading && exercises.length > 0 && !finishing
  useEffect(() => {
    if (!sessionActive) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [sessionActive])

  const handleAnswer = useCallback(async (result: AnswerResult, exerciseType: string) => {
    if ((!sessionId && !offlineBatch) || !exercises[currentIndex]) return

    const word = exercises[currentIndex].word
    // A mixed session asks each card in the direction it is scheduled in, so
    // the answer is credited to that one, not to the picker's value
    const answered = exercises[currentIndex].direction ?? defaultDirection(course)
    const runningCombo = result === 'correct' ? combo + 1 : 0
    if (offlineBatch) {
      // Kept on the phone with the moment it was answered: SM-2 schedules from
      // there, not from whenever the connection comes back
      await queueAnswer({
        wordId: word.id, result, direction: answered, exerciseType,
        answeredAt: new Date().toISOString(),
        batch: offlineBatch,
        bestCombo: Math.max(runningCombo, bestCombo),
      }).catch(() => {})
    } else {
      // Progress is saved answer by answer — a failed save must not block the session
      try {
        await fetch('/api/study/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wordId: word.id, result, exerciseType, direction: answered, timeSpent: 0, sessionId }),
        })
      } catch {}
    }

    const newResults = [...results, result]
    setResults(newResults)

    const newCombo = runningCombo
    setCombo(newCombo)
    if (newCombo > bestCombo) setBestCombo(newCombo)

    const stillMissed = result === 'correct'
      ? missed.filter(m => m.word.id !== word.id)
      : missed.some(m => m.word.id === word.id) ? missed : [...missed, exercises[currentIndex]]
    setMissed(stillMissed)

    if (currentIndex + 1 >= exercises.length) {
      // Anything still wrong can be replayed until it sticks
      if (stillMissed.length > 0) {
        setReviewingMissed(true)
        return
      }
      // Offline: nothing to close server-side, the queue carries the session
      if (offlineBatch) { setOfflineDone(true); return }
      setFinishing(true)
      const finalize = () =>
        fetch('/api/study/answer', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, results: newResults, bestCombo: Math.max(newCombo, bestCombo) }),
        })
      try {
        let res = await finalize()
        if (!res.ok) res = await finalize()
        const summary = await res.json()
        router.push(`/study/results?data=${encodeURIComponent(JSON.stringify({ ...summary, results: newResults }))}`)
      } catch {
        router.push('/dashboard')
      }
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [sessionId, offlineBatch, exercises, currentIndex, results, combo, bestCombo, router, course, missed])

  // Asked before anything else: the session request must already know the level
  if (!declaredLevel && !levelAsked) return <LevelPicker onDone={() => setLevelAsked(true)} />

  if (!mode) {
    return (
      <ModePicker
        course={course}
        onPick={setMode}
        direction={direction}
        onDirectionChange={setDirection}
        synced={synced}
      />
    )
  }
  if (offlineDone) {
    return (
      <AppShell title={t.chooseExercise}>
        <div className="space-y-4">
          <Card className="space-y-2 py-6 text-center">
            <p className="font-display text-4xl font-semibold tabular-nums">
              {results.filter(r => r === 'correct').length}/{results.length}
            </p>
            {/* No XP shown: it is awarded when the server replays the session */}
            <p className="text-sm text-muted-foreground">{t.offlineSessionDone}</p>
          </Card>
          <Button size="lg" className="w-full" onClick={() => router.push('/dashboard')}>
            {t.finishSession}
          </Button>
        </div>
      </AppShell>
    )
  }

  if (loading) return <LoadingScreen />
  if (exercises.length === 0) return <NoWordsDueScreen />

  if (reviewingMissed) {
    return (
      <MissedPrompt
        missed={missed}
        onReplay={() => {
          setExercises(shuffled(missed))
          setCurrentIndex(0)
          setReviewingMissed(false)
        }}
        onFinish={async () => {
          setReviewingMissed(false)
          setFinishing(true)
          try {
            const res = await fetch('/api/study/answer', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, results, bestCombo }),
            })
            const summary = await res.json()
            router.push(`/study/results?data=${encodeURIComponent(JSON.stringify({ ...summary, results }))}`)
          } catch {
            router.push('/dashboard')
          }
        }}
      />
    )
  }

  const current = exercises[currentIndex]
  // Each exercise carries its own direction: in a mixed session they differ
  const currentDirection: Direction = current.direction ?? defaultDirection(course)

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] pb-28">
      <SessionProgress
        current={currentIndex}
        total={exercises.length}
        combo={combo}
        results={results}
        onQuit={() => setConfirmQuit(true)}
        quitLabel={t.quit}
        wordId={current.word.id}
        wordLabel={current.word.term}
        wordTranslation={current.word.translation}
        exerciseType={current.exerciseType}
      />

      {confirmQuit && (
        <div className="px-4 pt-4">
          <Card className="animate-rise space-y-3">
            <p className="text-sm text-muted-foreground">{t.confirmQuit}</p>
            <div className="flex gap-3">
              <Button variant="destructive" className="flex-1" onClick={() => router.push('/dashboard')}>
                {t.quit}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmQuit(false)}>
                {t.cancel}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Silence about the pool would read as a broken session */}
      {offlineBatch && (
        <p className="px-4 pt-3 text-center text-[11px] text-warning">{t.offlineBanner}</p>
      )}

      <main key={currentIndex} className="animate-rise px-4 pt-5">
        <ExerciseBoundary
          fallback={
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground">{t.exerciseError}</p>
              <Button onClick={() => handleAnswer('incorrect', current.exerciseType)}>{t.skipWord}</Button>
            </div>
          }
        >
          {current.exerciseType === 'FLASHCARD' && (
            <FlashCard word={current.word} direction={currentDirection} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'QCM' && (
            <MultipleChoice
              word={current.word}
              direction={currentDirection}
              distractors={current.distractors}
              onAnswer={handleAnswer}
            />
          )}
          {current.exerciseType === 'TYPING' && (
            <TypingExercise
              word={current.word}
              direction={currentDirection}
              alsoAccepted={current.alsoAccepted}
              onAnswer={handleAnswer}
            />
          )}
          {current.exerciseType === 'CONJUGATION' && (
            <ConjugationExercise word={current.word} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'CLOZE' && (
            <ClozeExercise
              word={current.word}
              alsoAccepted={current.alsoAccepted}
              onAnswer={handleAnswer}
            />
          )}
          {current.exerciseType === 'LISTENING' && (
            <ListeningExercise word={current.word} onAnswer={handleAnswer} />
          )}
        </ExerciseBoundary>
      </main>
    </div>
  )
}

const MODE_ICONS: Record<StudyMode, LucideIcon> = {
  MIX: Shuffle,
  EXPRESSIONS: Quote,
  FLASHCARD: Layers,
  QCM: ListChecks,
  TYPING: PenLine,
  CLOZE: TextCursorInput,
  CONJUGATION: Repeat2,
  LISTENING: Ear,
}

function ModePicker({ course, onPick, direction, onDirectionChange, synced }: {
  course: Course
  onPick: (mode: StudyMode) => void
  direction: DirectionChoice
  onDirectionChange: (d: DirectionChoice) => void
  /** Answers just sent from the offline queue — worth confirming, silently lost otherwise */
  synced: number
}) {
  const t = getStrings(course.native)
  // Cloze, conjugation, reading and grammar are authored for the pair's `term`
  // language — they only make sense to someone learning that side
  const termContent = learnsTermLanguage(course)
  const learnedName = t.languageName[course.learned]

  const modes: Array<{ mode: StudyMode; label: string; desc: string }> = [
    { mode: 'MIX', label: t.modeMix, desc: t.modeMixDesc },
    { mode: 'EXPRESSIONS', label: t.modeExpressions, desc: t.modeExpressionsDesc },
    { mode: 'FLASHCARD', label: t.modeFlashcard, desc: t.modeFlashcardDesc },
    { mode: 'QCM', label: t.modeQcm, desc: t.modeQcmDesc },
    { mode: 'TYPING', label: t.modeTyping, desc: t.modeTypingDesc },
    { mode: 'LISTENING', label: t.modeListening, desc: t.modeListeningDesc },
    ...(termContent
      ? [
          { mode: 'CLOZE' as StudyMode, label: t.modeCloze, desc: t.modeClozeDesc(learnedName) },
          { mode: 'CONJUGATION' as StudyMode, label: t.modeConjugation, desc: t.modeConjugationDesc },
        ]
      : []),
  ]

  const [first, second] = courseDirections(course)
  const directionOptions = [
    ...[first, second].map(d => ({
      value: d as DirectionChoice,
      label: `${flagOf(promptLang(d))} → ${flagOf(answerLang(d))}`,
    })),
    // Reviews both schedules at once, each card in the direction it is due in
    { value: 'MIXED' as DirectionChoice, label: `${flagOf(promptLang(first))} ⇄ ${flagOf(answerLang(first))}` },
  ]

  return (
    <AppShell title={t.chooseExercise}>
      <div className="space-y-4">
        {synced > 0 && (
          <p className="text-center text-xs text-success">{t.offlineSynced(synced)}</p>
        )}
        {/* Direction toggle — each direction has its own SM-2 progression */}
        <div>
          <SectionLabel>{t.chooseDirection}</SectionLabel>
          <Segmented
            className="mt-2"
            value={direction}
            onChange={v => onDirectionChange(v as DirectionChoice)}
            options={directionOptions}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {modes.map(({ mode, label, desc }) => {
            const Icon = MODE_ICONS[mode]
            const featured = mode === 'MIX'
            return (
              <button
                key={mode}
                onClick={() => onPick(mode)}
                className={cn(
                  'pressable card-surface flex flex-col gap-1 p-4 text-left',
                  featured &&
                    'col-span-2 border-primary/40 bg-linear-to-br from-info-soft to-transparent shadow-[var(--shadow-glow)]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon size={20} className={featured ? 'text-primary' : 'text-muted-foreground'} />
                  {featured ? (
                    <Chip tone="info">
                      <Sparkles size={12} /> {t.recommended}
                    </Chip>
                  ) : null}
                </div>
                <p className="mt-1 font-display text-base font-semibold tracking-tight">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </button>
            )
          })}
        </div>

        {/* The free conversation is generated, not authored for the pair's
            `term` side — every course gets it */}
        <div className="space-y-2">
          <Link href="/conversation" className="pressable card-surface flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
              <MessagesSquare size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-semibold">{t.conversationTitle}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.conversationDesc}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </Link>
        </div>

        {termContent && (
          <div className="space-y-2">
            <Link href="/reading" className="pressable card-surface flex items-center gap-3 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                <BookOpen size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-semibold">{t.readingTitle}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.readingDesc}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
            </Link>
            <Link href="/grammar" className="pressable card-surface flex items-center gap-3 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                <Brain size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-semibold">{t.grammarTitle}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.grammarDesc(learnedName)}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}

class ExerciseBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

function MissedPrompt({ missed, onReplay, onFinish }: {
  missed: ExerciseWord[]
  onReplay: () => void
  onFinish: () => void
}) {
  const t = getStrings(useLang())
  return (
    <AppShell title={t.missedTitle}>
      <div className="space-y-4">
        <Card className="space-y-1 py-6 text-center">
          <p className="font-display text-4xl font-semibold tabular-nums">{missed.length}</p>
          <p className="text-sm text-muted-foreground">{t.missedCount(missed.length)}</p>
        </Card>

        <div className="space-y-2">
          {missed.slice(0, 8).map(m => (
            <Card key={m.word.id} className="flex items-baseline justify-between gap-3 p-3.5">
              <span className="min-w-0 font-display text-[15px] font-semibold">{m.word.term}</span>
              <span className="min-w-0 text-right text-xs text-muted-foreground">{m.word.translation}</span>
            </Card>
          ))}
        </div>

        <Button size="lg" className="w-full" onClick={onReplay}>
          {t.replayMissed}
        </Button>
        <Button variant="secondary" size="lg" className="w-full" onClick={onFinish}>
          {t.finishSession}
        </Button>
      </div>
    </AppShell>
  )
}

function LoadingScreen() {
  const t = getStrings(useLang())
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="space-y-4 text-center">
        <Loader2 size={32} className="mx-auto animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{t.preparingSession}</p>
      </div>
    </main>
  )
}

function NoWordsDueScreen() {
  const t = getStrings(useLang())
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-[430px]">
        <EmptyState icon={<PartyPopper size={22} />} title={t.noWordsDue} description={t.comeBackTomorrow} />
      </div>
    </main>
  )
}
