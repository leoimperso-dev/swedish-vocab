'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { localeOf } from '@/lib/courses'
import { useSpeechQueue } from '@/lib/use-speech-queue'
import { AppShell } from '@/components/AppShell'
import { SpeakButton } from '@/components/SpeakButton'
import { Card } from '@/components/ui/primitives'
import TappableText from '@/components/TappableText'
import { cn } from '@/lib/utils'
import type { Story } from '@prisma/client'

// Sentence-sized chunks: they read better, keep the highlight precise, and stay
// under the length where Chrome's watchdog cuts synthesis short.
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…])\s+(?=[^\s])/)
    .map(s => s.trim())
    .filter(Boolean)
}

export default function StoryReader({ story }: { story: Story }) {
  const course = useCourse()
  const t = getStrings(course.native)
  const locale = localeOf(course.learned)
  const { speak, stop, index, playing } = useSpeechQueue()

  // Flat sentence list drives playback; the [paragraph, sentence] shape drives rendering
  const { paragraphs, sentences } = useMemo(() => {
    const paras = story.body.split(/\n\n+/).map(splitSentences)
    const flat: string[] = []
    const paragraphsWithIds = paras.map(sentencesOfParagraph =>
      sentencesOfParagraph.map(sentence => {
        flat.push(sentence)
        return { text: sentence, id: flat.length - 1 }
      }),
    )
    return { paragraphs: paragraphsWithIds, sentences: flat }
  }, [story.body])

  const toggle = () => {
    if (playing) stop()
    else speak(sentences.map(text => ({ text, locale })))
  }

  return (
    <AppShell title={story.title} subtitle={story.titleTranslated}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link
          href="/reading"
          className="pressable inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          {t.back}
        </Link>
        <SpeakButton
          playing={playing}
          onToggle={toggle}
          label={t.readAloud}
          stopLabel={t.stopReading}
        />
      </div>

      <Card className="p-5">
        <div className="space-y-5 text-[17px] leading-[2] tracking-tight">
          {paragraphs.map((paragraph, pIdx) => (
            <p key={pIdx}>
              {paragraph.map(sentence => (
                <span
                  key={sentence.id}
                  className={cn(
                    'rounded transition-colors',
                    index === sentence.id && 'bg-warning-soft',
                  )}
                >
                  <TappableText text={sentence.text} locale={locale} t={t} />{' '}
                </span>
              ))}
            </p>
          ))}
        </div>
      </Card>

      <p className="mt-3 text-center text-xs text-muted-foreground">{t.tapAnyWord}</p>
    </AppShell>
  )
}
