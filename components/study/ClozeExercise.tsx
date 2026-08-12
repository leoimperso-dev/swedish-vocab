'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Minus, X, Lightbulb } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import { evaluateAnswer } from '@/lib/fuzzy'
import { answerableExamples } from '@/lib/cloze'
import { learnedLocale, parseDetails } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { Card, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface ClozeExample {
  term: string // sentence in the language being learned
  translation?: string
  blank: string // surface form to hide
}

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

export default function ClozeExercise({ word, onAnswer }: Props) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  // The hint gives the answer away, so it stays behind a tap: searching first
  // is what the exercise trains
  const [hintShown, setHintShown] = useState(false)
  const course = useCourse()
  const t = getStrings(course.native)

  const example = useMemo(() => {
    const examples = (Array.isArray(word.examples) ? word.examples : []) as unknown as ClozeExample[]
    const valid = examples.filter(e => e?.term && e?.blank)
    if (valid.length === 0) return null
    // Only sentences whose translation points at the hidden word — see lib/cloze.ts
    const answerable = answerableExamples(valid, word.translation)
    if (answerable.length === 0) return null
    return answerable[Math.floor(Math.random() * answerable.length)]
  }, [word])

  // Word-boundary match of the surface form, case-insensitive — split into before/word/after
  // so the answer can be revealed in place (colored) instead of just unmasking the full sentence
  const match = useMemo(() => {
    if (!example) return null
    const re = new RegExp(`(?<=^|[^\\p{L}])${escapeRegex(example.blank)}(?=$|[^\\p{L}])`, 'iu')
    const m = re.exec(example.term)
    if (!m) return null
    return {
      before: example.term.slice(0, m.index),
      word: m[0],
      after: example.term.slice(m.index + m[0].length),
    }
  }, [example])

  if (!example || !match) return null

  const details = parseDetails(word.details)
  const hint = details?.translations ? details.translations.join(', ') : word.translation

  const resultLabel: Record<AnswerResult, string> = {
    correct: t.resultCorrect,
    approximate: t.resultAlmost,
    incorrect: t.resultIncorrect,
  }

  const handleSubmit = () => {
    if (!input.trim() || result) return
    unlock()
    speak(example.term, learnedLocale(course))

    const evaluation = evaluateAnswer(input, example.blank)
    setResult(evaluation)

    if (evaluation === 'correct') setTimeout(() => onAnswer(evaluation, 'CLOZE'), 1500)
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 py-6 text-center">
        <p className="text-xs text-muted-foreground">{t.clozePrompt}</p>
        <p className="font-display text-3xl font-semibold leading-snug tracking-tight">
          {match.before}
          {result ? (
            <span className="text-success">{match.word}</span>
          ) : (
            <span className="text-muted-foreground">_____</span>
          )}
          {match.after}
        </p>
        {example.translation && (
          <p className="text-sm italic text-muted-foreground">{example.translation}</p>
        )}
      </Card>

      {hintShown || result ? (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-xs text-muted-foreground">
            {/* The headword is the answer — only reveal it after answering */}
            {result ? (
              <>
                <span className="font-semibold text-foreground">
                  {word.term.replace(/\(.*?\)/g, '').trim()}
                </span>{' '}
                — {hint}
              </>
            ) : (
              hint
            )}
          </p>
        </div>
      ) : (
        <button
          onClick={() => setHintShown(true)}
          className="pressable flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground"
        >
          <Lightbulb size={14} className="shrink-0 text-warning" />
          {t.showHint}
        </button>
      )}

      <div className="space-y-3">
        <TextField
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={!!result}
          placeholder="_____"
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
                  {t.expectedAnswer} <span className="font-medium">{example.blank}</span>
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
          <Button size="lg" className="w-full" onClick={() => onAnswer(result, 'CLOZE')}>
            {t.nextTurn}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
