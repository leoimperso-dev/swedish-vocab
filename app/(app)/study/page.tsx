'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import FlashCard from '@/components/study/FlashCard'
import MultipleChoice from '@/components/study/MultipleChoice'
import TypingExercise from '@/components/study/TypingExercise'
import ConjugationExercise from '@/components/study/ConjugationExercise'
import SessionProgress from '@/components/study/SessionProgress'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import type { ExerciseWord, AnswerResult } from '@/types'

export default function StudyPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseWord[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<AnswerResult[]>([])
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/study/session')
      .then(r => r.json())
      .then(data => {
        setSessionId(data.sessionId)
        setExercises(data.exercises)
        setLoading(false)
      })
  }, [])

  const handleAnswer = useCallback(async (result: AnswerResult, exerciseType: string) => {
    if (!sessionId || !exercises[currentIndex]) return

    const word = exercises[currentIndex].word
    await fetch('/api/study/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wordId: word.id,
        result,
        exerciseType,
        timeSpent: 0,
        sessionId,
      }),
    })

    const newResults = [...results, result]
    setResults(newResults)

    const newCombo = result === 'correct' ? combo + 1 : 0
    setCombo(newCombo)
    if (newCombo > bestCombo) setBestCombo(newCombo)

    if (currentIndex + 1 >= exercises.length) {
      // Session complete
      const finalizeRes = await fetch('/api/study/answer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, results: newResults, bestCombo: Math.max(newCombo, bestCombo) }),
      })
      const summary = await finalizeRes.json()
      router.push(`/study/results?data=${encodeURIComponent(JSON.stringify({ ...summary, results: newResults }))}`)
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [sessionId, exercises, currentIndex, results, combo, bestCombo, router])

  if (loading) return <LoadingScreen />

  if (exercises.length === 0) {
    return <EmptyState />
  }

  const current = exercises[currentIndex]

  return (
    <main className="min-h-dvh flex flex-col px-4 pt-6">
      <SessionProgress
        current={currentIndex}
        total={exercises.length}
        combo={combo}
        results={results}
      />

      <div className="flex-1 flex flex-col justify-center mt-4">
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
      </div>
    </main>
  )
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
