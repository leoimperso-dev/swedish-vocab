'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
import { promptText, answerText, learnedLocale } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
}

export default function MultipleChoice({ word, onAnswer }: Props) {
  const [options, setOptions] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lang = useLang()
  const t = getStrings(lang)
  const correctOption = answerText(word, lang)

  useEffect(() => {
    fetch(`/api/words/distractors?wordId=${word.id}&wordType=${word.wordType}&lang=${lang}`)
      .then(r => r.json())
      .then(data => {
        const all = [correctOption, ...data.distractors]
        setOptions(shuffle(all))
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word])

  const handleSelect = (option: string) => {
    if (selected) return
    setSelected(option)
    unlock()
    speak(promptText(word, lang), learnedLocale(lang))

    setTimeout(() => {
      const result: AnswerResult = option === correctOption ? 'correct' : 'incorrect'
      onAnswer(result, 'QCM')
    }, 800)
  }

  if (loading) return <div className="text-center text-slate-400">{t.loading}</div>

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-3xl p-8 text-center">
        <p className="text-3xl font-bold">{promptText(word, lang)}</p>
        <p className="text-slate-500 text-sm mt-2">{t.whichTranslation}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map(option => {
          let style = 'bg-slate-900 border border-slate-800 text-white'
          if (selected) {
            if (option === correctOption) style = 'bg-green-900 border border-green-600 text-green-300'
            else if (option === selected) style = 'bg-red-900 border border-red-600 text-red-300'
            else style = 'bg-slate-900 border border-slate-800 text-slate-600'
          }

          return (
            <motion.button
              key={option}
              onClick={() => handleSelect(option)}
              whileTap={{ scale: 0.96 }}
              className={`p-4 rounded-2xl text-sm font-medium text-left transition-all cursor-pointer ${style}`}
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
