import { auth } from '@/auth'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { Flame, Swords, Trophy, Zap } from 'lucide-react'
import { getLevelForXp, levelTitle } from '@/lib/xp'
import { getStrings } from '@/lib/i18n'
import { getCourse } from '@/lib/current-course'
import { duelRecord, xpByLanguage } from '@/lib/profile-stats'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/ui/avatar'
import { Card, ProgressBar, SectionLabel } from '@/components/ui/primitives'
import { Flag } from '@/components/ui/flags'
import { LastSeen } from '@/components/LastSeen'

/**
 * Another learner's profile, opened from the leaderboard or a duel.
 *
 * Public on purpose, and therefore deliberately thin: what they have earned and
 * how they play. No email, no settings, no course preferences.
 */
export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const [viewerCourse, user] = await Promise.all([
    getCourse(session!.user!.id),
    db.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, image: true, xp: true, lastSeenAt: true,
        streakCurrent: true, streakBest: true, createdAt: true,
        _count: { select: { weeklyWins: true } },
      },
    }),
  ])
  if (!user) notFound()

  const [languages, duels] = await Promise.all([
    xpByLanguage(user.id, user.xp),
    duelRecord(user.id),
  ])
  const t = getStrings(viewerCourse.native)
  const level = getLevelForXp(user.xp)

  return (
    <AppShell title={user.name ?? t.navProfile}>
      <div className="space-y-4">
        <Card className="flex items-center gap-3.5">
          <Avatar name={user.name} image={user.image} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {levelTitle(level, viewerCourse.learned)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <LastSeen at={user.lastSeenAt?.toISOString() ?? null} lang={viewerCourse.native} />
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <StatTile icon={<Zap size={15} className="text-warning" />} value={user.xp} label={t.xpLabel} />
          <StatTile icon={<Flame size={15} className="text-streak" />} value={user.streakCurrent} label={t.streakLabel} />
          <StatTile
            icon={<Trophy size={15} className="text-accent" />}
            value={user._count.weeklyWins}
            label={t.weeklyWinsLabel}
          />
        </div>

        {languages.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>{t.xpByLanguage}</SectionLabel>
            <Card className="space-y-3">
              {languages.map(entry => (
                <div key={entry.lang} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Flag lang={entry.lang} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t.languageName[entry.lang]}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {entry.xp} XP · {entry.words} {t.words}
                    </span>
                  </div>
                  <ProgressBar value={Math.round(entry.share * 100)} />
                </div>
              ))}
              {/* Honest about what this is: a StudySession does not record the
                  language it drilled, so the split is inferred from vocabulary */}
              <p className="text-[11px] text-muted-foreground">{t.xpByLanguageEstimate}</p>
            </Card>
          </div>
        )}

        <div className="space-y-2">
          <SectionLabel>{t.duelsLabel}</SectionLabel>
          <Card className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-primary">
              <Swords size={20} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {duels.won} / {duels.played} {t.duelsWon}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.duelWinStreak}: {duels.winStreak} · {t.best}: {duels.bestWinStreak}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card className="flex flex-col items-center gap-0.5 py-3">
      {icon}
      <span className="font-display text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-center text-[10px] leading-tight text-muted-foreground">{label}</span>
    </Card>
  )
}
