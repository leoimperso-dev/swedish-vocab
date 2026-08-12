import { auth, signOut } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, xpToNextLevel, LEVELS } from '@/lib/xp'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { MAX_FREEZES, FREEZE_EARN_EVERY } from '@/lib/streak'
import { asLang, getStrings } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import Image from 'next/image'
import { AppShell } from '@/components/AppShell'
import { Card, CardTitle, Chip, ProgressBar, SectionLabel } from '@/components/ui/primitives'
import { LevelPicker } from '@/components/LevelPicker'
import { resolveCourse } from '@/lib/courses'
import { Button } from '@/components/ui/button'
import { Check, Flame, Lock, LogOut, Snowflake, Trophy, Zap } from 'lucide-react'

const DAILY_GOAL_OPTIONS = [1, 2, 3, 5]

async function setDailyGoal(formData: FormData) {
  'use server'
  const goal = Number(formData.get('goal'))
  if (!DAILY_GOAL_OPTIONS.includes(goal)) return
  const session = await auth()
  if (!session?.user?.id) return
  await db.user.update({ where: { id: session.user.id }, data: { dailyGoalXp: goal } })
  revalidatePath('/profile')
}

export default async function ProfilePage() {
  const session = await auth()
  const userId = session!.user!.id

  const [user, unlockedAchievements] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
    }),
  ])

  if (!user) return null

  const t = getStrings(asLang(user.nativeLanguage))
  const level = getLevelForXp(user.xp)
  const { current, needed, progress } = xpToNextLevel(user.xp)
  const unlockedSlugs = unlockedAchievements.map(ua => ua.achievement.slug)

  return (
    <AppShell title={t.navProfile}>
      <div className="space-y-4">
        {/* User card */}
        <Card className="flex items-center gap-3.5">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? ''}
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-nordic font-display text-xl font-semibold text-primary-foreground">
              {user.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold tracking-tight">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <Chip tone="info" className="mt-2">
              {level.title} · {t.level} {level.level}
            </Chip>
          </div>
        </Card>

        {/* XP & level progress */}
        <Card>
          <CardTitle>{t.progression}</CardTitle>
          <div className="mt-3 flex items-baseline justify-between text-sm">
            <span className="font-display font-semibold">{level.title}</span>
            <span className="text-muted-foreground tabular-nums">
              {current} / {needed || '∞'} XP
            </span>
          </div>
          <ProgressBar className="mt-2" value={Math.min(progress * 100, 100)} tone="primary" />

          {/* Level roadmap */}
          <ul className="mt-4 space-y-0">
            {LEVELS.map((l, i) => {
              const done = l.level < user.level
              const isCurrent = l.level === user.level
              return (
                <li key={l.level} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold',
                        done && 'border-success/40 bg-success-soft text-success',
                        isCurrent && 'border-primary bg-primary text-primary-foreground',
                        !done && !isCurrent && 'border-border bg-surface text-muted-foreground',
                      )}
                    >
                      {done ? <Check size={13} /> : l.level}
                    </span>
                    {i < LEVELS.length - 1 ? (
                      <span className={cn('w-px flex-1', done ? 'bg-success/40' : 'bg-border')} />
                    ) : null}
                  </div>
                  <div className={cn('min-w-0 pb-4', !done && !isCurrent && 'opacity-55')}>
                    <p className="truncate font-display text-sm font-semibold">{l.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.minXp} XP</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* Stats résumé */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="flex flex-col items-center gap-1 p-3 text-center">
            <Zap size={14} className="text-warning" />
            <p className="font-display text-lg font-semibold tabular-nums">{user.xp}</p>
            <p className="text-[11px] text-muted-foreground">{t.totalXp}</p>
          </Card>
          <Card className="flex flex-col items-center gap-1 p-3 text-center">
            <Flame size={14} className="text-streak" />
            <p className="font-display text-lg font-semibold tabular-nums">{user.streakCurrent}</p>
            <p className="text-[11px] text-muted-foreground">{t.streak}</p>
          </Card>
          <Card className="flex flex-col items-center gap-1 p-3 text-center">
            <Trophy size={14} className="text-accent" />
            <p className="font-display text-lg font-semibold tabular-nums">{user.streakBest}</p>
            <p className="text-[11px] text-muted-foreground">{t.record}</p>
          </Card>
        </div>

        {/* CEFR level of the language being learned */}
        <Card>
          <CardTitle>
            {t.levelTitle} · {t.languageName[resolveCourse(user.nativeLanguage, user.learningLanguage).learned]}
          </CardTitle>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">{t.levelExplainer}</p>
          <LevelPicker embedded />
        </Card>

        {/* Daily goal setting */}
        <Card>
          <CardTitle>{t.dailyGoalSetting}</CardTitle>
          <form action={setDailyGoal} className="mt-3 grid grid-cols-4 gap-2">
            {DAILY_GOAL_OPTIONS.map(goal => {
              const selected = user.dailyGoalXp === goal
              return (
                <button
                  key={goal}
                  type="submit"
                  name="goal"
                  value={goal}
                  aria-pressed={selected}
                  className={cn(
                    'pressable rounded-xl border py-2.5 text-sm font-semibold tabular-nums',
                    selected
                      ? 'border-primary bg-info-soft text-primary'
                      : 'border-border bg-surface text-muted-foreground',
                  )}
                >
                  {goal} XP
                </button>
              )
            })}
          </form>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-freeze-soft p-3">
            <Snowflake size={16} className="mt-0.5 shrink-0 text-freeze" />
            <p className="text-xs text-freeze">{t.freezeInfo(user.freezeCount, MAX_FREEZES, FREEZE_EARN_EVERY)}</p>
          </div>
        </Card>

        {/* Achievements */}
        <div>
          <div className="flex items-center justify-between">
            <SectionLabel>{t.badges}</SectionLabel>
            <span className="text-xs text-muted-foreground tabular-nums">
              {unlockedSlugs.length} / {ACHIEVEMENTS.length}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {ACHIEVEMENTS.map(ach => {
              const unlocked = unlockedSlugs.includes(ach.slug)
              return (
                <Card
                  key={ach.slug}
                  className={cn('relative flex flex-col items-center gap-1 p-3 text-center', !unlocked && 'opacity-45')}
                  title={ach.description}
                >
                  <span className="text-2xl">{ach.icon}</span>
                  <span className="w-full truncate text-[11px] text-muted-foreground">{ach.name}</span>
                  {!unlocked ? <Lock size={11} className="absolute right-2 top-2 text-muted-foreground" /> : null}
                </Card>
              )
            })}
          </div>
        </div>

        {/* Sign out */}
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <Button type="submit" variant="secondary" className="w-full">
            <LogOut size={16} /> {t.signOut}
          </Button>
        </form>
      </div>
    </AppShell>
  )
}
