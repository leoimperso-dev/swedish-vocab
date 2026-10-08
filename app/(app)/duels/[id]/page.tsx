'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Minus, Swords } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/ui/avatar'
import { Card, Chip, SectionLabel } from '@/components/ui/primitives'
import { buttonClasses } from '@/components/ui/button'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { BLITZ_RANGE } from '@/lib/duel/rules'
import { cn } from '@/lib/utils'
import type { DuelDetail } from '@/app/api/duels/[id]/route'

export default function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = getStrings(useLang())
  const [duel, setDuel] = useState<DuelDetail | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    fetch(`/api/duels/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setDuel)
      .catch(() => setMissing(true))
  }, [id])

  if (missing) {
    return (
      <AppShell title={t.duelsTitle}>
        <Link href="/duels" className={buttonClasses({ variant: 'secondary', className: 'w-full' })}>
          {t.duelBack}
        </Link>
      </AppShell>
    )
  }

  if (!duel) {
    return (
      <AppShell title={t.duelsTitle}>
        <Loader2 size={24} className="mx-auto mt-8 animate-spin text-muted-foreground" />
      </AppShell>
    )
  }

  const name = duel.opponent.name ?? '?'
  const over = duel.status !== 'ACTIVE'
  const verdict = duel.youWon === null ? t.duelDraw : duel.youWon ? t.duelWon : t.duelLost

  return (
    <AppShell
      title={name}
      subtitle={[
        duel.mode === 'BLITZ'
          ? `${t.duelModeBlitz} · ${BLITZ_RANGE[0]}-${BLITZ_RANGE[1]}s`
          : t.duelModeClassic,
        t.duelRoundsValue(duel.rounds),
      ].join(' · ')}
    >
      <div className="space-y-4">
        <Link
          href="/duels"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={14} /> {t.duelBack}
        </Link>

        <Card className="space-y-3 py-5 text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-4xl font-semibold tabular-nums">{duel.yourWins}</span>
              <span className="text-xs text-muted-foreground">{t.duelYourScore}</span>
            </div>
            <Swords size={20} className="text-muted-foreground" />
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-4xl font-semibold tabular-nums">{duel.theirWins}</span>
              <Avatar name={duel.opponent.name} image={duel.opponent.image} size={24} />
            </div>
          </div>
          {over ? (
            <p className="font-display text-base font-semibold">{verdict}</p>
          ) : duel.yourTurn ? (
            <Chip tone="success">{t.duelYourTurn}</Chip>
          ) : (
            <Chip>{t.duelWaitingFor(name)}</Chip>
          )}
        </Card>

        {!over && duel.yourTurn && (
          <Link
            href={`/duels/${id}/play`}
            className={buttonClasses({ size: 'lg', className: 'w-full' })}
          >
            {t.duelPlayRound} · {t.duelRoundOf(duel.currentRound, duel.rounds)}
          </Link>
        )}

        <section className="space-y-2">
          <SectionLabel>{t.duelScoreboard}</SectionLabel>
          {duel.scoreboard.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.duelHiddenScore}</p>
          ) : (
            duel.scoreboard.map(row => {
              // A score stays hidden until both sides have answered that round,
              // so nobody plays knowing the number they have to beat.
              const settled = row.yours !== null && row.theirs !== null
              const youWonRound = settled && row.yours! > row.theirs!
              const tied = settled && row.yours === row.theirs
              return (
                <Card key={row.round} className="flex items-center gap-3 p-3">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">
                    {t.duelRoundOf(row.round, duel.rounds)}
                  </span>
                  <span
                    className={cn(
                      'flex-1 text-right font-display text-sm font-semibold tabular-nums',
                      settled && (youWonRound ? 'text-success' : tied ? '' : 'text-muted-foreground'),
                    )}
                  >
                    {row.yours === null ? '—' : settled ? t.duelPoints(row.yours) : '···'}
                  </span>
                  <Minus size={12} className="text-muted-foreground" />
                  <span
                    className={cn(
                      'flex-1 font-display text-sm font-semibold tabular-nums',
                      settled && (!youWonRound && !tied ? 'text-success' : 'text-muted-foreground'),
                    )}
                  >
                    {row.theirs === null ? '—' : settled ? t.duelPoints(row.theirs) : '···'}
                  </span>
                </Card>
              )
            })
          )}
        </section>

      </div>
    </AppShell>
  )
}
