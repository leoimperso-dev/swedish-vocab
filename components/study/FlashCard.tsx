'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { speak, unlock } from '@/lib/tts'
import { formatForms, parseDetails, promptText, answerText, learnedLocale } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

interface Props {
  word: Word
  onAnswer: (result: AnswerResult, type: string) => void
}

export default function FlashCard({ word, onAnswer }: Props) {
  const [flipped, setFlipped] = useState(false)
  const lang = useLang()
  const t = getStrings(lang)

  const handleFlip = () => {
    unlock()
    speak(promptText(word, lang), learnedLocale(lang))
    setFlipped(true)
  }

  return (
    <div className="space-y-6">
      {/* Card */}
      <motion.div
        className="bg-slate-900 rounded-3xl p-8 min-h-52 flex flex-col items-center justify-center text-center cursor-pointer active:scale-98"
        onClick={!flipped ? handleFlip : undefined}
        whileTap={{ scale: 0.98 }}
      >
        {!flipped ? (
          <div className="space-y-4">
            <p className="text-3xl font-bold">{promptText(word, lang)}</p>
            <p className="text-slate-500 text-sm">{t.tapToReveal}</p>
          </div>
        ) : (
          <FlashCardBack word={word} />
        )}
      </motion.div>

      {/* Answer buttons (only after flip) */}
      {flipped && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
          <AnswerBtn
            label={t.answerNo}
            sublabel={t.answerNoSub}
            className="bg-red-950 text-red-400 border border-red-900"
            onClick={() => onAnswer('incorrect', 'FLASHCARD')}
          />
          <AnswerBtn
            label={t.answerAlmost}
            sublabel={t.answerAlmostSub}
            className="bg-yellow-950 text-yellow-400 border border-yellow-900"
            onClick={() => onAnswer('approximate', 'FLASHCARD')}
          />
          <AnswerBtn
            label={t.answerYes}
            sublabel={t.answerYesSub}
            className="bg-green-950 text-green-400 border border-green-900"
            onClick={() => onAnswer('correct', 'FLASHCARD')}
          />
        </motion.div>
      )}

      {!flipped && (
        <button
          onClick={handleFlip}
          className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-semibold text-lg active:scale-95 transition-all cursor-pointer"
        >
          {t.flip}
        </button>
      )}
    </div>
  )
}

function FlashCardBack({ word }: { word: Word }) {
  const lang = useLang()
  const forms = formatForms(word.forms)
  const details = parseDetails(word.details)
  // Multiple translations and context notes are written in French — only useful in fr mode
  const mainAnswer = lang === 'fr' && details?.translations
    ? details.translations.join(' · ')
    : answerText(word, lang)

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm">
        {promptText(word, lang)}
        {lang === 'fr' && forms && <span className="text-slate-500"> ({forms})</span>}
      </p>
      <p className="text-2xl font-bold text-blue-300">{mainAnswer}</p>
      {lang === 'sv' && forms && (
        <p className="text-slate-500 text-xs">({forms})</p>
      )}
      {lang === 'fr' && details?.context && (
        <p className="text-slate-500 text-xs italic">{details.context}</p>
      )}
      {details?.usage && (
        <div className="text-xs space-y-1 pt-1">
          {details.usage.map(u => (
            <p key={u.sv} className="text-slate-400">
              <span className="text-slate-200 font-medium">{u.sv}</span> — {u.fr}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function AnswerBtn({ label, sublabel, className, onClick }: {
  label: string; sublabel: string; className: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-3 rounded-2xl text-sm font-semibold active:scale-95 transition-all cursor-pointer ${className}`}
    >
      <span>{label}</span>
      <span className="text-xs opacity-70 font-normal">{sublabel}</span>
    </button>
  )
}
