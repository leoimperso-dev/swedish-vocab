'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Minus, Volume2, X } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import { evaluateAnswer } from '@/lib/fuzzy'
import { learnedLocale, learnedText } from '@/lib/word-display'
import { learnsTermLanguage } from '@/lib/courses'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { Card, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface ClozeExample {
  term: string
  translation?: string
  blank: string
}

interface Props {
  word: Word
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

// Dictation: the word (or one of its example sentences) is spoken, never shown,
// and has to be typed back. The only exercise that trains the ear.
export default function ListeningExercise({ word, onAnswer }: Props) {
  const course = useCourse()
  const t = getStrings(course.native)
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const locale = learnedLocale(course)

  // Prefer a real sentence when the word has one — dictation of a lone word is
  // much easier. Picked once per word so replays say the same thing.
  //
  // Example sentences are authored in the pair's `term` language, so they are
  // only usable when that is the language being learned: dictating a Swedish
  // sentence to someone learning French read it in a French voice and never
  // once said a French word.
  const [prompt] = useState(() => {
    const examples = (learnsTermLanguage(course) && Array.isArray(word.examples)
      ? word.examples
      : []) as unknown as ClozeExample[]
    const usable = examples.filter(e => e?.term && e.term.split(/\s+/).length <= 12)
    if (usable.length > 0) {
      const picked = usable[Math.floor(Math.random() * usable.length)]
      return { text: picked.term, translation: picked.translation, isSentence: true }
    }
    return { text: learnedText(word, course), translation: undefined, isSentence: false }
  })

  const say = () => {
    unlock()
    speak(prompt.text, locale)
  }

  // Speak on arrival — the exercise makes no sense silent
  const said = useRef(false)
  useEffect(() => {
    if (said.current) return
    said.current = true
    const id = setTimeout(say, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resultLabel: Record<AnswerResult, string> = {
    correct: t.resultCorrect,
    approximate: t.resultAlmost,
    incorrect: t.resultIncorrect,
  }

  const handleSubmit = () => {
    if (!input.trim() || result) return
    const evaluation = evaluateAnswer(input, prompt.text)
    setResult(evaluation)
    if (evaluation === 'correct') setTimeout(() => onAnswer(evaluation, 'LISTENING'), 1600)
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 py-8 text-center">
        <p className="text-xs text-muted-foreground">{t.listeningPrompt}</p>
        <button
          onClick={say}
          aria-label={t.listen}
          className="pressable mx-auto grid size-20 place-items-center rounded-full border-2 border-primary/40 bg-info-soft text-primary"
        >
          <Volume2 size={30} />
        </button>
        <p className="text-xs text-muted-foreground">{t.listenAgain}</p>
      </Card>

      <div className="space-y-3">
        <TextField
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={!!result}
          placeholder={t.typeWhatYouHear}
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
              <p className="mt-1 text-xs text-foreground/80">
                {t.expectedAnswer} <span className="font-medium">{prompt.text}</span>
              </p>
              {prompt.translation && (
                <p className="mt-0.5 text-xs italic text-foreground/70">{prompt.translation}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!result ? (
          <Button size="lg" className="w-full" disabled={!input.trim()} onClick={handleSubmit}>
            {t.submit}
          </Button>
        ) : result !== 'correct' ? (
          <Button size="lg" className="w-full" onClick={() => onAnswer(result, 'LISTENING')}>
            {t.nextTurn}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
