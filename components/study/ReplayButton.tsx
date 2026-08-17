'use client'

import { Volume2 } from 'lucide-react'
import { speakSequence, unlock } from '@/lib/tts'
import { learnedSpeech } from '@/lib/word-display'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { cn } from '@/lib/utils'
import type { Word } from '@prisma/client'

/**
 * Replays the word in the language being learned, degrees included.
 *
 * Every exercise keeps one visible once the answer is out: the word was spoken
 * on submit, and a learner who missed it had no way to hear it again.
 */
export function ReplayButton({ word, className }: { word: Word; className?: string }) {
  const course = useCourse()
  const t = getStrings(course.native)

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        unlock()
        speakSequence(learnedSpeech(word, course))
      }}
      aria-label={t.listen}
      title={t.listen}
      className={cn(
        'pressable grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground',
        className,
      )}
    >
      <Volume2 size={16} />
    </button>
  )
}
