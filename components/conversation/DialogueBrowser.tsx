'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, MessagesSquare, Sparkles } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { AppShell } from '@/components/AppShell'
import { SectionLabel } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type Level = 'beginner' | 'intermediate' | 'expert'

interface DialogueMeta {
  slug: string
  title: string
  titleTranslated: string
  level: string
  turnCount: number
}

export default function DialogueBrowser({ dialogues, chatEnabled }: {
  dialogues: DialogueMeta[]
  chatEnabled: boolean
}) {
  const [level, setLevel] = useState<Level | null>(null)
  const t = getStrings(useLang())

  const levels: Array<{ level: Level; icon: string; label: string; desc: string; tone: string }> = [
    { level: 'beginner', icon: '🌱', label: t.levelBeginner, desc: t.levelBeginnerDesc, tone: 'text-success' },
    { level: 'intermediate', icon: '🌿', label: t.levelIntermediate, desc: t.levelIntermediateDesc, tone: 'text-info' },
    { level: 'expert', icon: '🌳', label: t.levelExpert, desc: t.levelExpertDesc, tone: 'text-accent' },
  ]

  if (!level) {
    return (
      <AppShell title={t.conversationTitle} subtitle={t.conversationDesc}>
        <div className="space-y-3">
          {/* Unlike the scripted dialogues, the free conversation has no fixed
              script to run out of — so it leads */}
          {chatEnabled && (
            <>
              <Link
                href="/conversation/chat"
                className="pressable card-surface flex items-center gap-3.5 border-primary/40 bg-linear-to-br from-info-soft to-transparent p-4 shadow-[var(--shadow-glow)]"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-info-soft text-primary">
                  <Sparkles size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-primary">{t.chatTitle}</span>
                  <span className="block text-xs text-muted-foreground">{t.chatDesc}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </Link>
              <SectionLabel>{t.dialoguesLabel}</SectionLabel>
            </>
          )}
          {levels.map(({ level: lvl, icon, label, desc, tone }) => (
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
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {dialogues.filter(d => d.level === lvl).length}
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={t.conversationTitle} subtitle={levels.find(l => l.level === level)!.label}>
      <div className="space-y-3">
        <button
          onClick={() => setLevel(null)}
          className="pressable inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          {t.back}
        </button>
        <SectionLabel>{t.dialoguesLabel}</SectionLabel>
        {dialogues
          .filter(d => d.level === level)
          .map(dialogue => (
            <Link
              key={dialogue.slug}
              href={`/conversation/${dialogue.slug}`}
              className="pressable card-surface flex items-center gap-3 p-4"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-primary">
                <MessagesSquare size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-semibold">{dialogue.title}</span>
                <span className="block truncate text-xs italic text-muted-foreground">
                  {dialogue.titleTranslated}
                </span>
                <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground/80">
                  {t.dialogueTurnCount(dialogue.turnCount)}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
      </div>
    </AppShell>
  )
}
