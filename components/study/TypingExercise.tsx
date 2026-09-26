'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Minus, X } from 'lucide-react'
import { speakSequence, unlock } from '@/lib/tts'
import { evaluateAlternatives } from '@/lib/fuzzy'
import { directionPrompt, directionAnswer, learnedSpeech } from '@/lib/word-display'
import { answerLang, type Direction } from '@/lib/courses'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { Card, TextField } from '@/components/ui/primitives'
import { ReplayButton } from '@/components/study/ReplayButton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'
import { HeroWord } from '@/components/study/HeroWord'

interface Props {
  word: Word
  direction: Direction
  // Other words that answer this prompt just as well — see the session route
  alsoAccepted?: string[]
  onAnswer: (result: AnswerResult, type: string) => void
  /**
   * Fired the instant the answer is graded, before any correction is shown or
   * spoken. A duel freezes its clock here: the points are earned by answering,
   * not by pressing "next".
   */
  onSubmitted?: (result: AnswerResult) => void
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

export default function TypingExercise({ word, direction, alsoAccepted, onAnswer, onSubmitted }: Props) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const course = useCourse()
  const t = getStrings(course.native)
  const expected = directionAnswer(word, direction)
  const translateLabel = t.translateTo(t.languageName[answerLang(direction)])

  const resultLabel: Record<AnswerResult, string> = {
    correct: t.resultCorrect,
    approximate: t.resultAlmost,
    incorrect: t.resultIncorrect,
  }

  const handleSubmit = () => {
    if (!input.trim() || result) return
    unlock()
    const evaluation = evaluateAlternatives(input, [expected, ...(alsoAccepted ?? [])])
    setResult(evaluation)
    onSubmitted?.(evaluation)

    // A correct answer flows on once the word has been said in full; a wrong one
    // waits for the learner to read it
    speakSequence(learnedSpeech(word, course), {
      onDone: evaluation === 'correct'
        ? () => setTimeout(() => onAnswer(evaluation, 'TYPING'), 400)
        : undefined,
    })
  }

  return (
    <div className="space-y-4">
      <Card className="py-8 text-center">
        <HeroWord text={directionPrompt(word, direction)} />
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

        {!result ? (
          <Button size="lg" className="w-full" disabled={!input.trim()} onClick={handleSubmit}>
            {t.submit}
          </Button>
        ) : result !== 'correct' ? (
          <div className="flex items-center gap-2">
            <Button size="lg" className="w-full" onClick={() => onAnswer(result, 'TYPING')}>
              {t.nextTurn}
            </Button>
            <ReplayButton word={word} className="size-11" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
