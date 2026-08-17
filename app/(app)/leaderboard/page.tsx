'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Flame, Trophy, Zap } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/AppShell'
import { Card, Segmented } from '@/components/ui/primitives'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState, ListSkeleton } from '@/components/ui/feedback'
import { CompeteTabs } from '@/components/CompeteTabs'
import { LastSeen } from '@/components/LastSeen'

interface RankedUser {
  rank: number
  id: string
  name: string | null
  image: string | null
  xp: number
  level: number
  levelTitle: string
  streak: number
  wordsStudied: number
  weeklyWins: number
  lastSeenAt: string | null
  isCurrentUser: boolean
}

type Period = 'week' | 'all'

const PODIUM_HEIGHTS = ['h-16', 'h-24', 'h-12']

/** Weeks topped, under the name — the point of winning a week is keeping it. */
function WeeklyWins({ count, label }: { count: number; label: string }) {
  if (count === 0) return null
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-accent" title={label}>
      <Trophy size={11} />
      <span className="text-[11px] font-semibold tabular-nums">{count}</span>
    </span>
  )
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<RankedUser[]>([])
  const [period, setPeriod] = useState<Period>('week')
  const [loading, setLoading] = useState(true)
  const lang = useLang()
  const t = getStrings(lang)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leaderboard?period=${period}`)
      .then(r => r.json())
      .then(d => { setUsers(d.leaderboard); setLoading(false) })
  }, [period])

  // Podium needs 3 users — below that, show everyone in the plain list
  const showPodium = users.length >= 3
  const top3 = showPodium ? users.slice(0, 3) : []
  const rest = showPodium ? users.slice(3) : users
  const podiumOrder = showPodium ? [top3[1], top3[0], top3[2]] : []

  return (
    <AppShell title={t.leaderboardTitle} subtitle={period === 'week' ? t.thisWeek : t.allTime}>
      <div className="space-y-4">
        <CompeteTabs active="leaderboard" />
        <Segmented
          value={period}
          onChange={v => setPeriod(v as Period)}
          options={[
            { value: 'week', label: t.thisWeek },
            { value: 'all', label: t.allTime },
          ]}
        />
        {period === 'week' && (
          <p className="-mt-2 text-xs text-muted-foreground">{t.weeklyReset}</p>
        )}

        {loading ? (
          <ListSkeleton rows={6} />
        ) : (
          <>
            {showPodium && (
              <Card className="pt-5">
                <div className="grid grid-cols-3 items-end gap-2">
                  {podiumOrder.map((user, i) => (
                    <PodiumSlot
                      key={user.id}
                      user={user}
                      height={PODIUM_HEIGHTS[i]}
                      size={i === 1 ? 52 : 42}
                      winsLabel={t.weeklyChampion(user.weeklyWins)}
                    />
                  ))}
                </div>
              </Card>
            )}

            <div className="space-y-2">
              {rest.map(user => (
                <Card
                  key={user.id}
                  className={cn(
                    'flex items-center gap-3 p-3',
                    user.isCurrentUser && 'border-primary/50 shadow-[var(--shadow-glow)]',
                  )}
                >
                  <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                    {user.rank}
                  </span>
                  <Link href={`/profile/${user.id}`} className="pressable flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={user.name} image={user.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {user.name}
                        {user.isCurrentUser ? (
                          <span className="ml-1.5 text-xs font-medium text-primary">{t.you}</span>
                        ) : null}
                        <WeeklyWins count={user.weeklyWins} label={t.weeklyChampion(user.weeklyWins)} />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.levelTitle} · {user.wordsStudied} {t.words}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground/80">
                        <LastSeen at={user.lastSeenAt} lang={lang} />
                      </p>
                    </div>
                  </Link>
                  {user.streak > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-streak">
                      <Flame size={13} /> {user.streak}
                    </span>
                  ) : null}
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-warning">
                    <Zap size={13} /> {user.xp}
                  </span>
                </Card>
              ))}
            </div>

            {users.length === 0 && (
              <EmptyState icon={<Trophy size={22} className="text-accent" />} title={t.beFirst} />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function PodiumSlot({ user, height, size, winsLabel }: {
  user: RankedUser
  height: string
  size: number
  winsLabel: string
}) {
  return (
    <Link href={`/profile/${user.id}`} className="pressable flex min-w-0 flex-col items-center gap-2">
      <Avatar name={user.name} image={user.image} size={size} />
      <p className="w-full truncate text-center text-xs font-semibold">
        {user.name}
        <WeeklyWins count={user.weeklyWins} label={winsLabel} />
      </p>
      <div
        className={cn(
          'flex w-full flex-col items-center justify-center gap-0.5 rounded-t-xl border border-b-0 border-border bg-surface-raised',
          height,
        )}
      >
        <span className="font-display text-lg font-semibold text-accent">{user.rank}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{user.xp} XP</span>
      </div>
    </Link>
  )
}

