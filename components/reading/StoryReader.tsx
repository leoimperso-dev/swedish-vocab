'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { localeOf } from '@/lib/courses'
import { useMissingVoice, useSpeechQueue } from '@/lib/use-speech-queue'
import { AppShell } from '@/components/AppShell'
import { SpeakButton } from '@/components/SpeakButton'
import { Card } from '@/components/ui/primitives'
import TappableText from '@/components/TappableText'
import { cn } from '@/lib/utils'
import { storyProperNouns } from '@/lib/proper-nouns'
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
  const missingVoice = useMissingVoice(locale)

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
  const properNouns = useMemo(() => storyProperNouns(story.body), [story.body])

  // Bilingual sources carry their own translation, paragraph for paragraph —
  // see scripts/add-story.ts. Hidden by default: reading it first is reading
  // French, not Swedish.
  const translated = useMemo(
    () => (story.bodyTranslated ? story.bodyTranslated.split(/\n\n+/) : []),
    [story.bodyTranslated],
  )
  const [shown, setShown] = useState<Set<number>>(new Set())
  const reveal = (paragraph: number) =>
    setShown(prev => {
      const next = new Set(prev)
      if (next.has(paragraph)) next.delete(paragraph)
      else next.add(paragraph)
      return next
    })

  // The voice reads on past the fold; the page has to follow it
  const activeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (index === null) return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [index])

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
            <div key={pIdx}>
              <p>
                {paragraph.map(sentence => (
                  <span
                    key={sentence.id}
                    ref={index === sentence.id ? activeRef : undefined}
                    className={cn(
                      'rounded transition-colors',
                      index === sentence.id && 'bg-warning-soft',
                    )}
                  >
                    <TappableText text={sentence.text} locale={locale} t={t} properNouns={properNouns} />{' '}
                  </span>
                ))}
              </p>
              {translated[pIdx] && (
                <button
                  onClick={() => reveal(pIdx)}
                  aria-expanded={shown.has(pIdx)}
                  className="pressable mt-1 text-left text-xs text-muted-foreground"
                >
                  {shown.has(pIdx) ? (
                    <span className="italic">{translated[pIdx]}</span>
                  ) : (
                    <span className="underline decoration-dotted">{t.showTranslation}</span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {missingVoice && (
        <p className="mt-3 text-center text-[11px] text-warning">
          {t.noVoiceForLanguage(t.languageName[course.learned])}
        </p>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground">{t.tapAnyWord}</p>
    </AppShell>
  )
}
