'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
import { evaluateAnswer } from '@/lib/fuzzy'
import { parseDetails } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface ClozeExample {
  sv: string
  fr?: string
  blank: string
}

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function ClozeExercise({ word, onAnswer }: Props) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const lang = useLang()
  const t = getStrings(lang)

  const example = useMemo(() => {
    const examples = (Array.isArray(word.examples) ? word.examples : []) as unknown as ClozeExample[]
    const valid = examples.filter(e => e?.sv && e?.blank)
    if (valid.length === 0) return null
    const translated = valid.filter(e => e.fr)
    const pool = translated.length > 0 ? translated : valid
    return pool[Math.floor(Math.random() * pool.length)]
  }, [word])

  const blanked = useMemo(() => {
    if (!example) return null
    // Word-boundary match of the surface form, case-insensitive
    const re = new RegExp(`(?<=^|[^\\p{L}])${escapeRegex(example.blank)}(?=$|[^\\p{L}])`, 'iu')
    if (!re.test(example.sv)) return null
    return example.sv.replace(re, '_____')
  }, [example])

  if (!example || !blanked) return null

  const details = parseDetails(word.details)
  const hint = details?.translations ? details.translations.join(', ') : word.french

  const resultConfig = {
    correct: { bg: 'bg-green-900 border-green-600', text: 'text-green-300', label: t.resultCorrect },
    approximate: { bg: 'bg-yellow-900 border-yellow-600', text: 'text-yellow-300', label: t.resultAlmost },
    incorrect: { bg: 'bg-red-900 border-red-600', text: 'text-red-300', label: t.resultIncorrect },
  }

  const handleSubmit = () => {
    if (!input.trim() || result) return
    unlock()
    speak(example.sv, 'sv-SE')

    const evaluation = evaluateAnswer(input, example.blank)
    setResult(evaluation)

    setTimeout(() => onAnswer(evaluation, 'CLOZE'), 1500)
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-3xl p-6 text-center space-y-3">
        <p className="text-slate-500 text-sm">{t.clozePrompt}</p>
        <p className="text-xl font-semibold leading-relaxed">
          {result ? example.sv : blanked}
        </p>
        {example.fr && (
          <p className="text-slate-400 text-sm italic">{example.fr}</p>
        )}
        {/* The Swedish headword is the answer — only reveal it after answering */}
        <p className="text-blue-300 text-sm">
          {result ? `${word.swedish.replace(/\(.*?\)/g, '').trim()} — ${hint}` : hint}
        </p>
      </div>

      <div className="space-y-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={!!result}
          placeholder="_____"
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
                  {t.expectedAnswer} <span className="font-medium">{example.blank}</span>
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
