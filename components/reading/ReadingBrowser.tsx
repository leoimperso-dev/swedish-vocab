'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { AppShell } from '@/components/AppShell'
import { SectionLabel } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export type StoryLevel = 'beginner' | 'intermediate' | 'expert' | 'dialogue'

interface StoryMeta {
  slug: string
  title: string
  titleTranslated: string
  level: string
  wordCount: number
}

export default function ReadingBrowser({ stories }: { stories: StoryMeta[] }) {
  const [level, setLevel] = useState<StoryLevel | null>(null)
  const t = getStrings(useLang())

  const levels: Array<{ level: StoryLevel; icon: string; label: string; desc: string; tone: string }> = [
    { level: 'beginner', icon: '🌱', label: t.levelBeginner, desc: t.levelBeginnerDesc, tone: 'text-success' },
    { level: 'intermediate', icon: '🌿', label: t.levelIntermediate, desc: t.levelIntermediateDesc, tone: 'text-info' },
    { level: 'expert', icon: '🌳', label: t.levelExpert, desc: t.levelExpertDesc, tone: 'text-accent' },
    { level: 'dialogue', icon: '💬', label: t.levelDialogue, desc: t.levelDialogueDesc, tone: 'text-primary' },
  ]

  if (!level) {
    return (
      <AppShell title={t.readingTitle} subtitle={t.chooseLevel}>
        <div className="space-y-3">
          {levels.map(({ level: lvl, icon, label, desc, tone }) => {
            const count = stories.filter(s => s.level === lvl).length
            return (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className="pressable card-surface flex w-full items-center gap-3.5 p-4 text-left"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-raised text-2xl">
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block font-display text-base font-semibold', tone)}>{label}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      </AppShell>
    )
  }

  const levelStories = stories.filter(s => s.level === level)
  const levelLabel = levels.find(l => l.level === level)!.label

  return (
    <AppShell title={t.readingTitle} subtitle={levelLabel}>
      <div className="space-y-3">
        <button
          onClick={() => setLevel(null)}
          className="pressable inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          {t.back}
        </button>
        <SectionLabel>{t.storiesLabel}</SectionLabel>
        {levelStories.map(story => (
          <Link
            key={story.slug}
            href={`/reading/${story.slug}`}
            className="pressable card-surface flex items-center gap-3 p-4"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-semibold">{story.title}</span>
              <span className="block text-xs italic text-muted-foreground">{story.titleTranslated}</span>
              <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground/80">
                {t.storyWordCount(story.wordCount)}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
