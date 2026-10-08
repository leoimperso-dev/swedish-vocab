'use client'

import { useState } from 'react'
import { speak, unlock } from '@/lib/tts'
import { evaluateVerbForms } from '@/lib/fuzzy'
import { learnedLocale } from '@/lib/word-display'
import { pairOf, verbFormsFor } from '@/lib/courses'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { Card, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'
import { HeroWord } from '@/components/study/HeroWord'

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
  /**
   * Fired the instant the answer is graded, before any correction is shown or
   * spoken. A duel freezes its clock here: the points are earned by answering,
   * not by pressing "next".
   */
  onSubmitted?: (result: AnswerResult) => void
  /** When true, suppress auto-advance and the built-in "Next" button. */
  manualNext?: boolean
}

// Drilled forms differ per language: Swedish present/preterit/supine,
// English past/past participle — the registry decides, i18n supplies the labels.
type FormKey = 'present' | 'preterit' | 'supine' | 'past' | 'pastParticiple'

export default function ConjugationExercise({ word, onAnswer, onSubmitted, manualNext }: Props) {
  const course = useCourse()
  const t = getStrings(course.native)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateVerbForms> | null>(null)
  // Set when the answer was not perfect: the learner reads the expected forms
  // and moves on when ready
  const [pending, setPending] = useState<AnswerResult | null>(null)

  const forms = word.forms as Record<string, string> | null
  if (!forms) return null

  const keys = verbFormsFor(pairOf(word.pair).term).filter(
    key => typeof forms[key] === 'string' && forms[key],
  )

  const handleSubmit = () => {
    if (evaluation) return
    unlock()
    speak(word.term, learnedLocale(course))

    const result = evaluateVerbForms(inputs, forms, keys)
    setEvaluation(result)

    // Overall result: if all correct → correct, if any incorrect → incorrect, else approximate
    const values = keys.map(key => result[key])
    const overall: AnswerResult = values.every(v => v === 'correct')
      ? 'correct'
      : values.some(v => v === 'incorrect')
      ? 'incorrect'
      : 'approximate'

    onSubmitted?.(overall)
    if (overall === 'correct' && !manualNext) setTimeout(() => onAnswer(overall, 'CONJUGATION'), 1500)
    else if (!manualNext) setPending(overall)
  }

  return (
    <div className="space-y-4">
      <Card className="py-6 text-center">
        <p className="text-xs text-muted-foreground">{t.infinitive}</p>
        <HeroWord text={word.term} />
        <p className="mt-2 text-sm text-primary">{word.translation}</p>
      </Card>

      <div className="space-y-3">
        {keys.map(key => {
          const res = evaluation?.[key]
          return (
            <TextField
              key={key}
              label={t[key as FormKey]}
              placeholder="…"
              value={inputs[key] ?? ''}
              disabled={!!evaluation}
              // TextField only supports success/error (no dedicated "approximate" tone) —
              // non-correct results (incorrect or approximate) render as error
              state={res ? (res === 'correct' ? 'success' : 'error') : 'idle'}
              hint={evaluation && res !== 'correct' ? `${t.expectedAnswer} ${forms[key]}` : undefined}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
            />
          )
        })}
      </div>

      {!evaluation ? (
        <Button size="lg" className="w-full" onClick={handleSubmit}>
          {t.submit}
        </Button>
      ) : pending ? (
        <Button size="lg" className="w-full" onClick={() => onAnswer(pending, 'CONJUGATION')}>
          {t.nextTurn}
        </Button>
      ) : null}
    </div>
  )
}
