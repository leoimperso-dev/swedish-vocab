'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Check, X, Volume2, Lightbulb } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import {
  formatForms, parseDetails, directionPrompt, directionAnswer,
  learnedText, learnedLocale, type Direction,
} from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import { SectionLabel } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import type { Word } from '@prisma/client'
import type { AnswerResult } from '@/types'

const SWIPE_THRESHOLD = 100

interface Props {
  word: Word
  direction: Direction
  onAnswer: (result: AnswerResult, type: string) => void
}

export default function FlashCard({ word, direction, onAnswer }: Props) {
  const [flipped, setFlipped] = useState(false)
  const [answered, setAnswered] = useState(false)
  const lang = useLang()
  const t = getStrings(lang)

  const x = useMotionValue(0)
  const rotate = useTransform(x, [-250, 250], [-14, 14])
  const knownOpacity = useTransform(x, [30, SWIPE_THRESHOLD], [0, 1])
  const unknownOpacity = useTransform(x, [-SWIPE_THRESHOLD, -30], [1, 0])

  const answer = (result: AnswerResult) => {
    if (answered) return
    setAnswered(true)
    onAnswer(result, 'FLASHCARD')
  }

  const handleFlip = () => {
    unlock()
    speak(learnedText(word, lang), learnedLocale(lang))
    setFlipped(true)
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD) answer('correct')
    else if (info.offset.x < -SWIPE_THRESHOLD) answer('incorrect')
  }

  return (
    <div className="space-y-4">
      {/* Card */}
      <motion.div
        className="pressable card-surface relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden px-5 py-8 text-center"
        onClick={!flipped ? handleFlip : undefined}
        drag={flipped && !answered ? 'x' : false}
        dragSnapToOrigin
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        style={flipped ? { x, rotate } : undefined}
        whileTap={{ scale: 0.98 }}
      >
        {flipped && (
          <>
            {/* Swipe overlays */}
            <motion.div
              style={{ opacity: knownOpacity }}
              className="absolute top-4 left-4 grid size-12 place-items-center rounded-full border-2 border-success/50 bg-success-soft text-success"
            >
              <Check size={24} />
            </motion.div>
            <motion.div
              style={{ opacity: unknownOpacity }}
              className="absolute top-4 right-4 grid size-12 place-items-center rounded-full border-2 border-danger/50 bg-danger-soft text-danger"
            >
              <X size={24} />
            </motion.div>
          </>
        )}

        {!flipped ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <p className="text-hero-word">{directionPrompt(word, direction)}</p>
              <Volume2 size={20} className="shrink-0 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t.tapToReveal}</p>
          </div>
        ) : (
          <FlashCardBack word={word} direction={direction} />
        )}
      </motion.div>

      {/* Answer buttons (only after flip) */}
      {flipped ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="destructive"
              className="h-auto flex-col gap-0.5 py-3"
              onClick={() => answer('incorrect')}
            >
              <span>{t.answerNo}</span>
              <span className="text-[10px] font-normal opacity-75">{t.answerNoSub}</span>
            </Button>
            <Button
              variant="accent"
              className="h-auto flex-col gap-0.5 py-3"
              onClick={() => answer('approximate')}
            >
              <span>{t.answerAlmost}</span>
              <span className="text-[10px] font-normal opacity-75">{t.answerAlmostSub}</span>
            </Button>
            <Button
              variant="success"
              className="h-auto flex-col gap-0.5 py-3"
              onClick={() => answer('correct')}
            >
              <span>{t.answerYes}</span>
              <span className="text-[10px] font-normal opacity-75">{t.answerYesSub}</span>
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">{t.swipeHint}</p>
        </motion.div>
      ) : (
        <Button variant="secondary" size="lg" className="w-full" onClick={handleFlip}>
          {t.flip}
        </Button>
      )}
    </div>
  )
}

function FlashCardBack({ word, direction }: { word: Word; direction: Direction }) {
  const lang = useLang()
  const t = getStrings(lang)
  const forms = formatForms(word.forms)
  const details = parseDetails(word.details)
  // Multiple translations and context notes are written in French — only useful in fr mode
  const mainAnswer = lang === 'fr' && direction === 'SV_FR' && details?.translations
    ? details.translations.join(' · ')
    : directionAnswer(word, direction)

  return (
    <div className="animate-rise space-y-3">
      <p className="text-sm text-muted-foreground">
        {directionPrompt(word, direction)}
        {lang === 'fr' && direction === 'SV_FR' && forms && <span> ({forms})</span>}
      </p>
      <p className="font-display text-2xl font-semibold text-primary">{mainAnswer}</p>
      {(lang === 'sv' || direction === 'FR_SV') && forms && (
        <p className="text-xs text-muted-foreground">({forms})</p>
      )}
      {lang === 'fr' && details?.context && (
        <p className="text-xs italic text-muted-foreground">{details.context}</p>
      )}
      {details?.usage && (
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-left">
          <SectionLabel className="flex items-center gap-1.5">
            <Lightbulb size={12} /> {t.usageNote}
          </SectionLabel>
          <div className="mt-1.5 space-y-1">
            {details.usage.map(u => (
              <p key={u.sv} className="text-sm">
                <span className="font-semibold">{u.sv}</span> — {u.fr}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
