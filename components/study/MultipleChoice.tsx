'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
import { directionPrompt, directionAnswer, learnedText, learnedLocale, type Direction } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import { Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface Props {
  word: Word
  direction: Direction
  distractors?: string[]
  onAnswer: (result: AnswerResult, type: string) => void
}

export default function MultipleChoice({ word, direction, distractors, onAnswer }: Props) {
  const [options, setOptions] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lang = useLang()
  const t = getStrings(lang)
  const correctOption = directionAnswer(word, direction)
  const answerLang = direction === 'FR_SV' ? 'sv' : 'fr'

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
    fetch(`/api/words/distractors?wordId=${word.id}&wordType=${word.wordType}&lang=${answerLang}`)
      .then(r => r.json())
      .then(data => applyOptions(Array.isArray(data?.distractors) ? data.distractors : []))
      .catch(() => applyOptions([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word])

  const handleSelect = (option: string) => {
    if (selected) return
    setSelected(option)
    unlock()
    speak(learnedText(word, lang), learnedLocale(lang))

    setTimeout(() => {
      const result: AnswerResult = option === correctOption ? 'correct' : 'incorrect'
      onAnswer(result, 'QCM')
    }, 800)
  }

  if (loading) return <div className="text-center text-muted-foreground">{t.loading}</div>

  return (
    <div className="space-y-4">
      <Card className="py-8 text-center">
        <p className="text-hero-word">{directionPrompt(word, direction)}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t.whichTranslation}</p>
      </Card>

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
