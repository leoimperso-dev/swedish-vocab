'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
import { evaluateAnswer } from '@/lib/fuzzy'
import { directionPrompt, directionAnswer, learnedText, learnedLocale, type Direction } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface Props {
  word: Word
  direction: Direction
  onAnswer: (result: AnswerResult, type: string) => void
}

export default function TypingExercise({ word, direction, onAnswer }: Props) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lang = useLang()
  const t = getStrings(lang)
  const expected = directionAnswer(word, direction)
  const translateLabel = direction === 'FR_SV' ? t.translateToSwedish : t.translateToFrench

  const resultConfig = {
    correct: { bg: 'bg-green-900 border-green-600', text: 'text-green-300', label: t.resultCorrect },
    approximate: { bg: 'bg-yellow-900 border-yellow-600', text: 'text-yellow-300', label: t.resultAlmost },
    incorrect: { bg: 'bg-red-900 border-red-600', text: 'text-red-300', label: t.resultIncorrect },
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
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-3xl p-8 text-center">
        <p className="text-3xl font-bold">{directionPrompt(word, direction)}</p>
        <p className="text-slate-500 text-sm mt-2">{translateLabel}</p>
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={!!result}
          placeholder={t.yourAnswer}
          autoFocus
          className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-4 text-lg outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
        />

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`border rounded-xl p-3 ${resultConfig[result].bg}`}
            >
              <p className={`font-semibold ${resultConfig[result].text}`}>
                {resultConfig[result].label}
              </p>
              {result !== 'correct' && (
                <p className="text-slate-300 text-sm mt-1">
                  {t.expectedAnswer} <span className="font-medium">{expected}</span>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!result && (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-lg active:scale-95 transition-all cursor-pointer"
          >
            {t.submit}
          </button>
        )}
      </div>
    </div>
  )
}
