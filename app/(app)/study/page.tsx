'use client'

import { Component, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Shuffle, Layers, ListChecks, PenLine, TextCursorInput, Repeat2,
  BookOpen, Brain, ChevronRight, Sparkles, Loader2, PartyPopper, Ear,
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
import { useCourse, useLang } from '@/components/CourseProvider'
import {
  courseDirections, defaultDirection, flagOf, learnsTermLanguage, promptLang, answerLang,
  type Course, type Direction,
} from '@/lib/courses'
import type { ExerciseWord, AnswerResult, ExerciseType } from '@/types'

type StudyMode = 'MIX' | ExerciseType

export default function StudyPage() {
  const router = useRouter()
  const course = useCourse()
  const t = getStrings(course.native)
  const [mode, setMode] = useState<StudyMode | null>(null)
  const [direction, setDirection] = useState<Direction>(defaultDirection(course))
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseWord[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<AnswerResult[]>([])
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [loading, setLoading] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)

  useEffect(() => {
    if (!mode) return
    setLoading(true)
    const params = new URLSearchParams({ direction })
    if (mode !== 'MIX') params.set('mode', mode)
    fetch(`/api/study/session?${params}`)
      .then(r => r.json())
      .then(data => {
        setSessionId(data.sessionId ?? null)
        setExercises(Array.isArray(data.exercises) ? data.exercises : [])
        setLoading(false)
      })
      .catch(() => {
        setMode(null)
        setLoading(false)
      })
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
    if (!sessionId || !exercises[currentIndex]) return

    const word = exercises[currentIndex].word
    // Progress is saved answer by answer — a failed save must not block the session
    try {
      await fetch('/api/study/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordId: word.id, result, exerciseType, direction, timeSpent: 0, sessionId }),
      })
    } catch {}

    const newResults = [...results, result]
    setResults(newResults)

    const newCombo = result === 'correct' ? combo + 1 : 0
    setCombo(newCombo)
    if (newCombo > bestCombo) setBestCombo(newCombo)

    if (currentIndex + 1 >= exercises.length) {
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
  }, [sessionId, exercises, currentIndex, results, combo, bestCombo, router, direction])

  if (!mode) {
    return (
      <ModePicker
        course={course}
        onPick={setMode}
        direction={direction}
        onDirectionChange={setDirection}
      />
    )
  }
  if (loading) return <LoadingScreen />
  if (exercises.length === 0) return <NoWordsDueScreen />

  const current = exercises[currentIndex]

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] pb-24">
      <SessionProgress
        current={currentIndex}
        total={exercises.length}
        combo={combo}
        results={results}
        onQuit={() => setConfirmQuit(true)}
        quitLabel={t.quit}
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
            <FlashCard word={current.word} direction={direction} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'QCM' && (
            <MultipleChoice
              word={current.word}
              direction={direction}
              distractors={current.distractors}
              onAnswer={handleAnswer}
            />
          )}
          {current.exerciseType === 'TYPING' && (
            <TypingExercise word={current.word} direction={direction} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'CONJUGATION' && (
            <ConjugationExercise word={current.word} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'CLOZE' && (
            <ClozeExercise word={current.word} onAnswer={handleAnswer} />
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
  FLASHCARD: Layers,
  QCM: ListChecks,
  TYPING: PenLine,
  CLOZE: TextCursorInput,
  CONJUGATION: Repeat2,
  LISTENING: Ear,
}

function ModePicker({ course, onPick, direction, onDirectionChange }: {
  course: Course
  onPick: (mode: StudyMode) => void
  direction: Direction
  onDirectionChange: (d: Direction) => void
}) {
  const t = getStrings(course.native)
  // Cloze, conjugation, reading and grammar are authored for the pair's `term`
  // language — they only make sense to someone learning that side
  const termContent = learnsTermLanguage(course)
  const learnedName = t.languageName[course.learned]

  const modes: Array<{ mode: StudyMode; label: string; desc: string }> = [
    { mode: 'MIX', label: t.modeMix, desc: t.modeMixDesc },
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

  const directionOptions = courseDirections(course).map(d => ({
    value: d,
    label: `${flagOf(promptLang(d))} → ${flagOf(answerLang(d))}`,
  }))

  return (
    <AppShell title={t.chooseExercise}>
      <div className="space-y-4">
        {/* Direction toggle — each direction has its own SM-2 progression */}
        <div>
          <SectionLabel>{t.chooseDirection}</SectionLabel>
          <Segmented
            className="mt-2"
            value={direction}
            onChange={v => onDirectionChange(v as Direction)}
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
