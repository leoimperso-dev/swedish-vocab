'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
import { evaluateVerbForms } from '@/lib/fuzzy'
import type { Word } from '@prisma/client'
import type { AnswerResult, VerbForms } from '@/types'

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
}

const FIELD_LABELS = [
  { key: 'present' as const, label: 'Présent' },
  { key: 'preterit' as const, label: 'Prétérit' },
  { key: 'supine' as const, label: 'Supin' },
]

const RESULT_COLORS = {
  correct: 'border-green-600 bg-green-900/40',
  approximate: 'border-yellow-600 bg-yellow-900/40',
  incorrect: 'border-red-600 bg-red-900/40',
}

export default function ConjugationExercise({ word, onAnswer }: Props) {
  const [inputs, setInputs] = useState<Partial<VerbForms>>({})
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateVerbForms> | null>(null)

  const forms = word.forms as Partial<VerbForms> | null
  if (!forms) return null
  const fields = FIELD_LABELS.filter(({ key }) => typeof forms[key] === 'string' && forms[key])

  const handleSubmit = () => {
    if (evaluation) return
    unlock()
    speak(word.swedish)

    const result = evaluateVerbForms(inputs, forms)
    setEvaluation(result)

    // Overall result: if all correct → correct, if any incorrect → incorrect, else approximate
    const values = fields.map(({ key }) => result[key])
    const overall: AnswerResult = values.every(v => v === 'correct')
      ? 'correct'
      : values.some(v => v === 'incorrect')
      ? 'incorrect'
      : 'approximate'

    setTimeout(() => onAnswer(overall, 'CONJUGATION'), 1500)
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-3xl p-6 text-center">
        <p className="text-slate-500 text-sm mb-1">Infinitif</p>
        <p className="text-3xl font-bold">{word.swedish}</p>
        <p className="text-blue-300 mt-2">{word.french}</p>
      </div>

      <div className="space-y-3">
        {fields.map(({ key, label }) => {
          const res = evaluation?.[key]
          return (
            <div key={key} className="space-y-1">
              <label className="text-slate-400 text-sm">{label}</label>
              <div className="relative">
                <input
                  value={inputs[key] ?? ''}
                  onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  disabled={!!evaluation}
                  placeholder={`${label.toLowerCase()}...`}
                  className={`w-full bg-slate-900 border rounded-xl px-4 py-3 outline-none transition-all disabled:opacity-70 ${
                    res ? RESULT_COLORS[res] : 'border-slate-700 focus:border-blue-500'
                  }`}
                />
              </div>
              <AnimatePresence>
                {evaluation && res !== 'correct' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-slate-400 text-xs pl-1"
                  >
                    → <span className="text-white font-medium">{forms[key]}</span>
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {!evaluation && (
        <button
          onClick={handleSubmit}
          className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-semibold text-lg active:scale-95 transition-all cursor-pointer"
        >
          Valider
        </button>
      )}
    </div>
  )
}
