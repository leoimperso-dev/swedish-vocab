'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { speakSequence, unlock } from '@/lib/tts'
import { directionPrompt, directionAnswer, learnedSpeech } from '@/lib/word-display'
import { answerLang, type Direction } from '@/lib/courses'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { Card } from '@/components/ui/primitives'
import { ReplayButton } from '@/components/study/ReplayButton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'
import { HeroWord } from '@/components/study/HeroWord'

interface Props {
  word: Word
  direction: Direction
  distractors?: string[]
  onAnswer: (result: AnswerResult, type: string) => void
  /**
   * Fired the instant the answer is graded, before any correction is shown or
   * spoken. A duel freezes its clock here: the points are earned by answering,
   * not by pressing "next".
   */
  onSubmitted?: (result: AnswerResult) => void
}

export default function MultipleChoice({ word, direction, distractors, onAnswer, onSubmitted }: Props) {
  const [options, setOptions] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const course = useCourse()
  const t = getStrings(course.native)
  const correctOption = directionAnswer(word, direction)
  const optionsLang = answerLang(direction)

  useEffect(() => {
    const applyOptions = (list: string[]) => {
      // No duplicates — a distractor can share the exact translation of the target word
      const unique = [...new Set([correctOption, ...list.filter(d => d !== correctOption)])]
      setOptions(shuffle(unique))
      setLoading(false)
    }

    // Distractors are pre-computed by the session API; fetch is only a fallback
    if (distractors && distractors.length >= 3) {
      applyOptions(distractors)
      return
    }
    fetch(`/api/words/distractors?wordId=${word.id}&wordType=${word.wordType}&lang=${optionsLang}`)
      .then(r => r.json())
      .then(data => applyOptions(Array.isArray(data?.distractors) ? data.distractors : []))
      .catch(() => applyOptions([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word])

  const handleSelect = (option: string) => {
    if (selected) return
    setSelected(option)
    onSubmitted?.(option === correctOption ? 'correct' : 'incorrect')
    unlock()
    // Right answers flow on, but only once the word has been said in full —
    // cutting the voice off mid-superlative teaches half the word
    const done = option === correctOption
      ? () => setTimeout(() => onAnswer('correct', 'QCM'), 400)
      : undefined
    speakSequence(learnedSpeech(word, course), { onDone: done })
  }

  if (loading) return <div className="text-center text-muted-foreground">{t.loading}</div>

  return (
    <div className="space-y-4">
      <Card className="py-8 text-center">
        <HeroWord text={directionPrompt(word, direction)} />
        <p className="mt-2 text-xs text-muted-foreground">{t.whichTranslation}</p>
      </Card>

      {selected && selected !== correctOption && (
        <div className="flex items-center gap-2">
          <Button size="lg" className="w-full" onClick={() => onAnswer('incorrect', 'QCM')}>
            {t.nextTurn}
          </Button>
          <ReplayButton word={word} className="size-11" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {options.map(option => {
          const isCorrect = !!selected && option === correctOption
          const isWrong = selected === option && option !== correctOption

          return (
            <motion.button
              key={option}
              onClick={() => handleSelect(option)}
              disabled={!!selected}
              whileTap={{ scale: 0.96 }}
              className={cn(
                'pressable card-surface min-h-20 px-3 py-4 text-left text-sm font-semibold',
                isCorrect && 'border-success/60 bg-success-soft text-success',
                isWrong && 'animate-shake border-danger/60 bg-danger-soft text-danger',
                selected && !isCorrect && !isWrong && 'opacity-45',
              )}
            >
              {option}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
