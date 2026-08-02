'use client'

import type { ReactNode } from 'react'
import { Flame, Snowflake, Zap } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import { useStats } from '@/components/StatsProvider'
import { toggleLanguage } from '@/app/(app)/actions'
import { Chip } from '@/components/ui/primitives'

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const lang = useLang()
  const t = getStrings(lang)
  const { streak, freezes, xp } = useStats()

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] pb-28">
      <header className="safe-top sticky top-0 z-40 border-b border-border/70 bg-background/85 px-4 pb-3 backdrop-blur-xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <form action={toggleLanguage}>
            <button
              type="submit"
              title={t.switchMode}
              aria-label={t.switchMode}
              className="pressable flex h-9 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface"
            >
              {lang === 'fr' ? <SwedishFlag /> : <FrenchFlag />}
            </button>
          </form>
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <Chip tone="streak">
            <Flame size={13} /> {streak} j
          </Chip>
          {freezes > 0 ? (
            <Chip tone="freeze">
              <Snowflake size={13} /> {freezes}
            </Chip>
          ) : null}
          <Chip tone="warning">
            <Zap size={13} /> {xp.toLocaleString('fr-FR')} XP
          </Chip>
        </div>
      </header>

      <main className="animate-rise px-4 pt-4">{children}</main>
    </div>
  )
}

export function SwedishFlag() {
  return (
    <svg viewBox="0 0 16 10" className="h-4 w-6" aria-hidden="true">
      <rect width="16" height="10" fill="#005293" />
      <rect x="5" width="2" height="10" fill="#FECB00" />
      <rect y="4" width="16" height="2" fill="#FECB00" />
    </svg>
  )
}

export function FrenchFlag() {
  return (
    <svg viewBox="0 0 16 10" className="h-4 w-6" aria-hidden="true">
      <rect width="16" height="10" fill="#FFFFFF" />
      <rect width="5.33" height="10" fill="#002395" />
      <rect x="10.67" width="5.33" height="10" fill="#ED2939" />
    </svg>
  )
}
