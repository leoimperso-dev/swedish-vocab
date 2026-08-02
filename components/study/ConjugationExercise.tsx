'use client'

import { useState } from 'react'
import { speak, unlock } from '@/lib/tts'
import { evaluateVerbForms } from '@/lib/fuzzy'
import { Card, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import type { Word } from '@prisma/client'
import type { AnswerResult, VerbForms } from '@/types'

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
}

// CONJUGATION mode is fr-native only (see conjugationAvailable in study/page.tsx) — labels
// are intentionally hardcoded French rather than pulled from lib/i18n.ts, matching the
// pre-existing behavior of this file.
const FIELD_LABELS = [
  { key: 'present' as const, label: 'Présent' },
  { key: 'preterit' as const, label: 'Prétérit' },
  { key: 'supine' as const, label: 'Supin' },
]

export default function ConjugationExercise({ word, onAnswer }: Props) {
  const [inputs, setInputs] = useState<Partial<VerbForms>>({})
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateVerbForms> | null>(null)

  const forms = word.forms as Partial<VerbForms> | null
  if (!forms) return null
  const fields = FIELD_LABELS.filter(({ key }) => typeof forms[key] === 'string' && forms[key])

  const handleSubmit = () => {
    if (evaluation) return
    unlock()
    speak(word.swedish)

    const result = evaluateVerbForms(inputs, forms)
    setEvaluation(result)

    // Overall result: if all correct → correct, if any incorrect → incorrect, else approximate
    const values = fields.map(({ key }) => result[key])
    const overall: AnswerResult = values.every(v => v === 'correct')
      ? 'correct'
      : values.some(v => v === 'incorrect')
      ? 'incorrect'
      : 'approximate'

    setTimeout(() => onAnswer(overall, 'CONJUGATION'), 1500)
  }

  return (
    <div className="space-y-4">
      <Card className="py-6 text-center">
        <p className="text-xs text-muted-foreground">Infinitif</p>
        <p className="text-hero-word">{word.swedish}</p>
        <p className="mt-2 text-sm text-primary">{word.french}</p>
      </Card>

      <div className="space-y-3">
        {fields.map(({ key, label }) => {
          const res = evaluation?.[key]
          return (
            <TextField
              key={key}
              label={label}
              placeholder="…"
              value={inputs[key] ?? ''}
              disabled={!!evaluation}
              // TextField only supports success/error (no dedicated "approximate" tone) —
              // non-correct results (incorrect or approximate) render as error
              state={res ? (res === 'correct' ? 'success' : 'error') : 'idle'}
              // i18n-missing: expectedForm ("Attendu :") — this component doesn't use lib/i18n.ts at all (fr-only)
              hint={evaluation && res !== 'correct' ? `Attendu : ${forms[key]}` : undefined}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
            />
          )
        })}
      </div>

      {!evaluation && (
        <Button size="lg" className="w-full" onClick={handleSubmit}>
          Valider
        </Button>
      )}
    </div>
  )
}
