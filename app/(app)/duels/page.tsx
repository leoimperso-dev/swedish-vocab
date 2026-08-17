'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Swords, ChevronRight, Flame, Plus, Trophy } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { CompeteTabs } from '@/components/CompeteTabs'
import { Avatar } from '@/components/ui/avatar'
import { Flag } from '@/components/ui/flags'
import { Card, Chip, SectionLabel } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { EmptyState, ListSkeleton } from '@/components/ui/feedback'
import { NewDuelForm } from '@/components/duel/NewDuelForm'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import type { DuelSummaryRow } from '@/lib/duel/service'

export default function DuelsPage() {
  const t = getStrings(useLang())
  const router = useRouter()
  const [duels, setDuels] = useState<DuelSummaryRow[] | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    fetch('/api/duels')
      .then(r => r.json())
      .then(d => setDuels(Array.isArray(d.duels) ? d.duels : []))
      .catch(() => setDuels([]))
  }, [])

  useEffect(() => { load() }, [load])

  const active = duels?.filter(d => d.status === 'ACTIVE') ?? []
  const finished = duels?.filter(d => d.status === 'FINISHED') ?? []
  const record = {
    wins: finished.filter(d => d.youWon === true).length,
    losses: finished.filter(d => d.youWon === false).length,
    draws: finished.filter(d => d.youWon === null).length,
  }

  return (
    <AppShell title={t.duelsTitle} subtitle={t.duelsSubtitle}>
      <div className="space-y-4">
        <CompeteTabs active="duels" />

        {creating ? (
          <NewDuelForm
            onCancel={() => setCreating(false)}
            onCreated={id => router.push(`/duels/${id}`)}
          />
        ) : (
          <Button className="w-full" onClick={() => setCreating(true)}>
            <Plus size={16} /> {t.duelNew}
          </Button>
        )}

        {duels === null ? (
          <ListSkeleton rows={4} />
        ) : duels.length === 0 ? (
          <EmptyState
            icon={<Swords size={22} className="text-accent" />}
            title={t.duelNoDuels}
            description={t.duelNoDuelsDesc}
          />
        ) : (
          <>
            {finished.length > 0 && (
              <Card className="flex items-center justify-between p-3.5">
                <span className="text-sm text-muted-foreground">{t.duelFinished}</span>
                <span className="font-display text-sm font-semibold tabular-nums">
                  {t.duelRecord(record.wins, record.losses, record.draws)}
                </span>
              </Card>
            )}

            {active.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>{t.duelActive}</SectionLabel>
                {active.map(duel => (
                  <DuelRow key={duel.id} duel={duel} />
                ))}
              </section>
            )}

            {finished.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>{t.duelFinished}</SectionLabel>
                {finished.map(duel => (
                  <DuelRow key={duel.id} duel={duel} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function DuelRow({ duel }: { duel: DuelSummaryRow }) {
  const t = getStrings(useLang())
  const name = duel.opponent.name ?? '?'
  const status =
    duel.status === 'FINISHED'
      ? duel.youWon === null
        ? t.duelDraw
        : duel.youWon
          ? t.duelWon
          : t.duelLost
      : duel.yourTurn
        ? t.duelYourTurn
        : t.duelWaitingFor(name)

  return (
    <Link href={`/duels/${duel.id}`} className="pressable card-surface flex items-center gap-3 p-3">
      <Avatar name={duel.opponent.name} image={duel.opponent.image} size={38} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          {name}
          <Flag lang={duel.opponentLearning} />
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {duel.mode === 'BLITZ' ? t.duelModeBlitz : t.duelModeClassic} ·{' '}
          {t.duelRoundOf(Math.min(duel.currentRound, duel.rounds), duel.rounds)}
        </p>
        {/* Who you are up against: their record, and the run they are on */}
        <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground/80">
          <Trophy size={11} className="shrink-0 text-accent" />
          <span className="tabular-nums">
            {duel.opponentRecord.won}/{duel.opponentRecord.played} {t.duelsWon}
          </span>
          {duel.opponentRecord.winStreak > 1 && (
            <span className="flex shrink-0 items-center gap-0.5 text-streak">
              <Flame size={11} /> {duel.opponentRecord.winStreak}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-display text-sm font-semibold tabular-nums">
          {duel.yourWins}–{duel.theirWins}
        </span>
        {duel.yourTurn && duel.status === 'ACTIVE' ? (
          <Chip tone="success">{t.duelYourTurn}</Chip>
        ) : (
          <span className="max-w-24 truncate text-[11px] text-muted-foreground">{status}</span>
        )}
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </Link>
  )
}
