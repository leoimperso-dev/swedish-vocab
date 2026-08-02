'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Minus, X } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import { evaluateAnswer } from '@/lib/fuzzy'
import { directionPrompt, directionAnswer, learnedText, learnedLocale, type Direction } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import { Card, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface Props {
  word: Word
  direction: Direction
  onAnswer: (result: AnswerResult, type: string) => void
}

const FEEDBACK_ICON: Record<AnswerResult, typeof Check> = {
  correct: Check,
  approximate: Minus,
  incorrect: X,
}

const FEEDBACK_CLASS: Record<AnswerResult, string> = {
  correct: 'border-success/40 bg-success-soft text-success',
  approximate: 'border-warning/40 bg-warning-soft text-warning',
  incorrect: 'border-danger/40 bg-danger-soft text-danger',
}

export default function TypingExercise({ word, direction, onAnswer }: Props) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const lang = useLang()
  const t = getStrings(lang)
  const expected = directionAnswer(word, direction)
  const translateLabel = direction === 'FR_SV' ? t.translateToSwedish : t.translateToFrench

  const resultLabel: Record<AnswerResult, string> = {
    correct: t.resultCorrect,
    approximate: t.resultAlmost,
    incorrect: t.resultIncorrect,
  }

  const handleSubmit = () => {
    if (!input.trim() || result) return
    unlock()
    speak(learnedText(word, lang), learnedLocale(lang))

    const evaluation = evaluateAnswer(input, expected)
    setResult(evaluation)

    setTimeout(() => onAnswer(evaluation, 'TYPING'), 1200)
  }

  return (
    <div className="space-y-4">
      <Card className="py-8 text-center">
        <p className="text-hero-word">{directionPrompt(word, direction)}</p>
        <p className="mt-2 text-xs text-muted-foreground">{translateLabel}</p>
      </Card>

      <div className="space-y-3">
        <TextField
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={!!result}
          placeholder={t.yourAnswer}
          autoFocus
          state={result === 'incorrect' ? 'error' : result ? 'success' : 'idle'}
        />

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('animate-pop rounded-xl border p-3', FEEDBACK_CLASS[result])}
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                {(() => {
                  const Icon = FEEDBACK_ICON[result]
                  return <Icon size={16} />
                })()}
                {resultLabel[result]}
              </p>
              {result !== 'correct' && (
                <p className="mt-1 text-xs text-foreground/80">
                  {t.expectedAnswer} <span className="font-medium">{expected}</span>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!result && (
          <Button size="lg" className="w-full" disabled={!input.trim()} onClick={handleSubmit}>
            {t.submit}
          </Button>
        )}
      </div>
    </div>
  )
}
