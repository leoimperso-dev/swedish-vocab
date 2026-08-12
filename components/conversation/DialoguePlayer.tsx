'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Mic, Minus, PartyPopper, Square, Volume2, X } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { localeOf } from '@/lib/courses'
import { speak, unlock } from '@/lib/tts'
import { useMissingVoice } from '@/lib/use-speech-queue'
import { isRecognitionSupported, useSpeechRecognition } from '@/lib/use-speech-recognition'
import { evaluateSpokenAlternatives } from '@/lib/fuzzy'
import { AppShell } from '@/components/AppShell'
import { Card, ProgressBar, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AnswerResult } from '@/types'
import type { Dialogue } from '@prisma/client'

export interface Turn {
  speaker: 'them' | 'you'
  text: string
  translation: string
  // Other correct ways to say the same line — see scripts/import-dialogue-variants.ts
  accepts?: string[]
}

const FEEDBACK_CLASS: Record<AnswerResult, string> = {
  correct: 'border-success/40 bg-success-soft text-success',
  approximate: 'border-warning/40 bg-warning-soft text-warning',
  incorrect: 'border-danger/40 bg-danger-soft text-danger',
}
const FEEDBACK_ICON = { correct: Check, approximate: Minus, incorrect: X }

/**
 * Plays a conversation one turn at a time: "them" lines are spoken by the
 * device, "you" lines are prompted in the interface language and answered out
 * loud. Recognition is browser-only, so a typed fallback is always reachable.
 */
export default function DialoguePlayer({ dialogue }: { dialogue: Dialogue }) {
  const course = useCourse()
  const t = getStrings(course.native)
  const locale = localeOf(course.learned)
  const missingVoice = useMissingVoice(locale)

  const turns = dialogue.turns as unknown as Turn[]
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [revealed, setRevealed] = useState(false)
  // One editable answer, whether it came from the microphone or the keyboard —
  // recognition mishears often enough that it has to stay correctable
  const [answer, setAnswer] = useState('')
  const { start, stop, cancel, listening, transcript, interim, error, reset } = useSpeechRecognition(locale)
  const canSpeak = isRecognitionSupported()

  const turn = turns[index]
  const done = index >= turns.length
  const theirLine = !done && turn.speaker === 'them'

  // Their lines are spoken on arrival — the learner has to hear them, not read them
  const spokenAt = useRef(-1)
  useEffect(() => {
    if (!theirLine || spokenAt.current === index) return
    spokenAt.current = index
    unlock()
    const id = setTimeout(() => speak(turn.text, locale), 300)
    return () => clearTimeout(id)
  }, [index, theirLine, turn, locale])

  const goNext = useCallback(() => {
    cancel()
    reset()
    setResult(null)
    setRevealed(false)
    setAnswer('')
    setIndex(i => i + 1)
  }, [cancel, reset])

  const grade = () => {
    if (!answer.trim() || result) return
    const evaluation = evaluateSpokenAlternatives(answer, [turn.text, ...(turn.accepts ?? [])])
    setResult(evaluation)
    if (evaluation !== 'incorrect') speak(turn.text, locale)
  }

  // What the engine heard lands in the field, where it can still be fixed
  useEffect(() => {
    if (transcript) setAnswer(transcript)
  }, [transcript])

  const restart = () => {
    setIndex(0)
    setResult(null)
    setRevealed(false)
    setAnswer('')
    reset()
  }

  if (done) {
    return (
      <AppShell title={dialogue.title} subtitle={dialogue.titleTranslated}>
        <Card className="space-y-4 py-10 text-center">
          <PartyPopper size={40} className="mx-auto text-success" />
          <p className="font-display text-xl font-semibold">{t.dialogueDone}</p>
        </Card>
        <div className="mt-4 space-y-2">
          <Button size="lg" className="w-full" onClick={restart}>{t.replay}</Button>
          <Link
            href="/conversation"
            className="pressable block w-full rounded-xl border border-border bg-surface py-3 text-center text-sm font-semibold text-muted-foreground"
          >
            {t.back}
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={dialogue.title} subtitle={dialogue.titleTranslated}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <ProgressBar value={(index / turns.length) * 100} />
          <p className="text-center text-[11px] tabular-nums text-muted-foreground">
            {t.turnProgress(index + 1, turns.length)}
          </p>
        </div>

        {/* Transcript so far — their lines readable, the learner's kept short */}
        <div className="space-y-2">
          {turns.slice(Math.max(0, index - 3), index).map((past, i) => (
            <div
              key={index - Math.min(index, 3) + i}
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                past.speaker === 'them'
                  ? 'bg-surface-raised text-foreground'
                  : 'ml-auto bg-info-soft text-primary',
              )}
            >
              <p>{past.text}</p>
              <p className="mt-0.5 text-[11px] italic opacity-70">{past.translation}</p>
            </div>
          ))}
        </div>

        {theirLine ? (
          <Card className="space-y-4 py-7 text-center">
            <button
              onClick={() => { unlock(); speak(turn.text, locale) }}
              aria-label={t.listen}
              className="pressable mx-auto grid size-16 place-items-center rounded-full border-2 border-primary/40 bg-info-soft text-primary"
            >
              <Volume2 size={26} />
            </button>
            <p className="text-[17px] leading-snug">{turn.text}</p>
            <p className="text-xs italic text-muted-foreground">{turn.translation}</p>
            <Button size="lg" className="w-full" onClick={goNext}>{t.nextTurn}</Button>
          </Card>
        ) : (
          <Card className="space-y-4 py-6">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t.yourTurn}</p>
              <p className="mt-1.5 text-[17px] font-medium leading-snug">{turn.translation}</p>
            </div>

            {!result && (
              <div className="space-y-3">
                {canSpeak && (
                  <div className="space-y-1.5 text-center">
                    <button
                      onClick={() => (listening ? stop() : start())}
                      aria-label={listening ? t.stopReading : t.tapToSpeak}
                      className={cn(
                        'pressable mx-auto grid size-20 place-items-center rounded-full border-2',
                        listening
                          ? 'animate-pulse border-danger/50 bg-danger-soft text-danger'
                          : 'border-primary/40 bg-info-soft text-primary',
                      )}
                    >
                      {listening ? <Square size={26} /> : <Mic size={30} />}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {listening ? t.listeningTapToStop : t.tapToSpeak}
                    </p>
                    {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
                  </div>
                )}

                {/* The transcript lands here and stays editable — the engine
                    mishears learners often, and the cue is on screen anyway */}
                <TextField
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && grade()}
                  placeholder={canSpeak ? t.orTypeAnswer : t.typeWhatYouHear}
                  autoFocus={!canSpeak}
                />
                <Button className="w-full" disabled={!answer.trim()} onClick={grade}>
                  {t.submit}
                </Button>
              </div>
            )}

            {error && (
              <p className="text-center text-xs text-warning">
                {error === 'not-allowed' ? t.micDenied
                  : error === 'unsupported' ? t.micUnsupported
                  : t.micNoSpeech}
              </p>
            )}

            {result && (
              <div className={cn('animate-pop space-y-1 rounded-xl border p-3', FEEDBACK_CLASS[result])}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {(() => { const Icon = FEEDBACK_ICON[result]; return <Icon size={16} /> })()}
                  {result === 'correct' ? t.resultCorrect
                    : result === 'approximate' ? t.resultAlmost
                    : t.resultIncorrect}
                </p>
                <p className="text-xs text-foreground/70">{t.iHeard} « {answer} »</p>
                <p className="text-xs text-foreground/80">
                  {t.expectedAnswer} <span className="font-medium">{turn.text}</span>
                </p>
              </div>
            )}

            {revealed && !result && (
              <p className="rounded-xl bg-surface-raised p-3 text-center text-sm">{turn.text}</p>
            )}

            <div className="space-y-2">
              {result ? (
                <Button size="lg" className="w-full" onClick={goNext}>{t.nextTurn}</Button>
              ) : !revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  className="pressable w-full text-xs text-muted-foreground underline underline-offset-2"
                >
                  {t.showAnswer}
                </button>
              ) : (
                <Button variant="secondary" size="lg" className="w-full" onClick={goNext}>
                  {t.nextTurn}
                </Button>
              )}
            </div>
          </Card>
        )}

        {missingVoice && (
          <p className="text-center text-[11px] text-warning">
            {t.noVoiceForLanguage(t.languageName[course.learned])}
          </p>
        )}
      </div>
    </AppShell>
  )
}
