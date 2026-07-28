'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
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

  useEffect(() => {
    fetch(`/api/words/distractors?wordId=${word.id}&wordType=${word.wordType}`)
      .then(r => r.json())
      .then(data => {
        const all = [word.french, ...data.distractors]
        setOptions(shuffle(all))
        setLoading(false)
      })
  }, [word])

  const handleSelect = (option: string) => {
    if (selected) return
    setSelected(option)
    unlock()
    speak(word.swedish)

    setTimeout(() => {
      const result: AnswerResult = option === word.french ? 'correct' : 'incorrect'
      onAnswer(result, 'QCM')
    }, 800)
  }

  if (loading) return <div className="text-center text-slate-400">Chargement...</div>

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-3xl p-8 text-center">
        <p className="text-3xl font-bold">{word.swedish}</p>
        <p className="text-slate-500 text-sm mt-2">Quelle est la traduction ?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map(option => {
          let style = 'bg-slate-900 border border-slate-800 text-white'
          if (selected) {
            if (option === word.french) style = 'bg-green-900 border border-green-600 text-green-300'
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
