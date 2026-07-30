'use client'

import { Component, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import FlashCard from '@/components/study/FlashCard'
import MultipleChoice from '@/components/study/MultipleChoice'
import TypingExercise from '@/components/study/TypingExercise'
import ConjugationExercise from '@/components/study/ConjugationExercise'
import SessionProgress from '@/components/study/SessionProgress'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import type { ExerciseWord, AnswerResult, ExerciseType } from '@/types'

type StudyMode = 'MIX' | ExerciseType

export default function StudyPage() {
  const router = useRouter()
  const lang = useLang()
  const t = getStrings(lang)
  const [mode, setMode] = useState<StudyMode | null>(null)
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
    const param = mode === 'MIX' ? '' : `?mode=${mode}`
    fetch(`/api/study/session${param}`)
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
        body: JSON.stringify({ wordId: word.id, result, exerciseType, timeSpent: 0, sessionId }),
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
  }, [sessionId, exercises, currentIndex, results, combo, bestCombo, router])

  if (!mode) return <ModePicker onPick={setMode} conjugationAvailable={lang === 'fr'} />
  if (loading) return <LoadingScreen />
  if (exercises.length === 0) return <EmptyState />

  const current = exercises[currentIndex]

  return (
    <main className="min-h-dvh flex flex-col px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <SessionProgress
            current={currentIndex}
            total={exercises.length}
            combo={combo}
            results={results}
          />
        </div>
        <button
          onClick={() => setConfirmQuit(true)}
          title={t.quit}
          className="text-slate-500 hover:text-slate-300 text-xl px-2 py-1 cursor-pointer"
        >
          ✕
        </button>
      </div>

      {confirmQuit && (
        <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
          <p className="text-sm text-slate-300">{t.confirmQuit}</p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 py-3 rounded-xl bg-red-950 border border-red-900 text-red-400 font-semibold cursor-pointer active:scale-95 transition-all"
            >
              {t.quit}
            </button>
            <button
              onClick={() => setConfirmQuit(false)}
              className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer active:scale-95 transition-all"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center mt-4">
        <ExerciseBoundary
          key={currentIndex}
          fallback={
            <div className="text-center space-y-4">
              <p className="text-slate-400">{t.exerciseError}</p>
              <button
                onClick={() => handleAnswer('incorrect', current.exerciseType)}
                className="px-6 py-3 rounded-2xl bg-blue-600 font-semibold cursor-pointer"
              >
                {t.skipWord}
              </button>
            </div>
          }
        >
          {current.exerciseType === 'FLASHCARD' && (
            <FlashCard word={current.word} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'QCM' && (
            <MultipleChoice word={current.word} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'TYPING' && (
            <TypingExercise word={current.word} onAnswer={handleAnswer} />
          )}
          {current.exerciseType === 'CONJUGATION' && (
            <ConjugationExercise word={current.word} onAnswer={handleAnswer} />
          )}
        </ExerciseBoundary>
      </div>
    </main>
  )
}

function ModePicker({ onPick, conjugationAvailable }: {
  onPick: (mode: StudyMode) => void
  conjugationAvailable: boolean
}) {
  const t = getStrings(useLang())

  const modes: Array<{ mode: StudyMode; icon: string; label: string; desc: string }> = [
    { mode: 'MIX', icon: '🎲', label: t.modeMix, desc: t.modeMixDesc },
    { mode: 'FLASHCARD', icon: '🃏', label: t.modeFlashcard, desc: t.modeFlashcardDesc },
    { mode: 'QCM', icon: '🔘', label: t.modeQcm, desc: t.modeQcmDesc },
    { mode: 'TYPING', icon: '⌨️', label: t.modeTyping, desc: t.modeTypingDesc },
    ...(conjugationAvailable
      ? [{ mode: 'CONJUGATION' as StudyMode, icon: '📖', label: t.modeConjugation, desc: t.modeConjugationDesc }]
      : []),
  ]

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{t.chooseExercise}</h1>
      <div className="space-y-3">
        {modes.map(({ mode, icon, label, desc }) => (
          <button
            key={mode}
            onClick={() => onPick(mode)}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all cursor-pointer active:scale-98 ${
              mode === 'MIX'
                ? 'bg-blue-600 hover:bg-blue-500'
                : 'bg-slate-900 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span className="text-3xl">{icon}</span>
            <span>
              <span className="block font-bold">{label}</span>
              <span className={`block text-sm ${mode === 'MIX' ? 'text-blue-200' : 'text-slate-500'}`}>{desc}</span>
            </span>
          </button>
        ))}
      </div>
    </main>
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
    <main className="min-h-dvh flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-4xl animate-spin">⚙️</div>
        <p className="text-slate-400">{t.preparingSession}</p>
      </div>
    </main>
  )
}

function EmptyState() {
  const t = getStrings(useLang())
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold mb-2">{t.noWordsDue}</h1>
      <p className="text-slate-400">{t.comeBackTomorrow}</p>
    </main>
  )
}
