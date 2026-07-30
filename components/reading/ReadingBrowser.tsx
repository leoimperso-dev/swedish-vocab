'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'

export type StoryLevel = 'beginner' | 'intermediate' | 'expert' | 'dialogue'

interface StoryMeta {
  slug: string
  title: string
  titleFrench: string
  level: string
  wordCount: number
}

export default function ReadingBrowser({ stories }: { stories: StoryMeta[] }) {
  const [level, setLevel] = useState<StoryLevel | null>(null)
  const t = getStrings(useLang())

  const levels: Array<{ level: StoryLevel; icon: string; label: string; desc: string }> = [
    { level: 'beginner', icon: '🌱', label: t.levelBeginner, desc: t.levelBeginnerDesc },
    { level: 'intermediate', icon: '🌿', label: t.levelIntermediate, desc: t.levelIntermediateDesc },
    { level: 'expert', icon: '🌳', label: t.levelExpert, desc: t.levelExpertDesc },
    { level: 'dialogue', icon: '💬', label: t.levelDialogue, desc: t.levelDialogueDesc },
  ]

  if (!level) {
    return (
      <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t.readingTitle}</h1>
          <p className="text-slate-400 text-sm mt-1">{t.chooseLevel}</p>
        </div>
        <div className="space-y-3">
          {levels.map(({ level: lvl, icon, label, desc }) => {
            const count = stories.filter(s => s.level === lvl).length
            return (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer active:scale-98"
              >
                <span className="text-3xl">{icon}</span>
                <span className="flex-1">
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-slate-500">{desc}</span>
                </span>
                <span className="text-slate-500 text-sm">{count}</span>
              </button>
            )
          })}
        </div>
      </main>
    )
  }

  const levelStories = stories.filter(s => s.level === level)
  const levelLabel = levels.find(l => l.level === level)!.label

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-4">
      <div>
        <button onClick={() => setLevel(null)} className="text-slate-400 text-sm cursor-pointer hover:text-slate-200">
          {t.back}
        </button>
        <h1 className="text-2xl font-bold mt-1">{levelLabel}</h1>
      </div>
      <div className="space-y-3">
        {levelStories.map(story => (
          <Link
            key={story.slug}
            href={`/reading/${story.slug}`}
            className="block p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer active:scale-98"
          >
            <p className="font-bold">{story.title}</p>
            <p className="text-slate-500 text-sm">{story.titleFrench}</p>
            <p className="text-slate-600 text-xs mt-1">{t.storyWordCount(story.wordCount)}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
