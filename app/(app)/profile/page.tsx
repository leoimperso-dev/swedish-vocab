import { auth, signOut } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, xpToNextLevel, LEVELS } from '@/lib/xp'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { MAX_FREEZES, FREEZE_EARN_EVERY } from '@/lib/streak'
import { revalidatePath } from 'next/cache'
import Image from 'next/image'

const DAILY_GOAL_OPTIONS = [10, 20, 30, 50]

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

  const level = getLevelForXp(user.xp)
  const { current, needed, progress } = xpToNextLevel(user.xp)
  const unlockedSlugs = unlockedAchievements.map(ua => ua.achievement.slug)

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-6">
      {/* User card */}
      <div className="bg-slate-900 rounded-2xl p-6 flex items-center gap-4">
        {user.image && (
          <Image src={user.image} alt={user.name ?? ''} width={64} height={64} className="rounded-full" />
        )}
        <div className="flex-1">
          <p className="text-xl font-bold">{user.name}</p>
          <p className="text-slate-400 text-sm">{user.email}</p>
          <p className="text-blue-400 text-sm mt-1">{level.title} · Niveau {level.level}</p>
        </div>
      </div>

      {/* XP & level progress */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold text-slate-300">Progression</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{level.title}</span>
            <span className="text-slate-400">{current} / {needed || '∞'} XP</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Level roadmap */}
        <div className="space-y-2 pt-2">
          {LEVELS.map(l => (
            <div key={l.level} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                user.level >= l.level ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {l.level}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${user.level >= l.level ? 'text-white' : 'text-slate-500'}`}>
                  {l.title}
                </p>
              </div>
              <span className="text-slate-600 text-xs">{l.minXp} XP</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats résumé */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="XP total" value={user.xp} />
        <MiniStat label="Série" value={`🔥 ${user.streakCurrent}`} />
        <MiniStat label="Record" value={`${user.streakBest}j`} />
      </div>

      {/* Daily goal setting */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold text-slate-300">Objectif quotidien</h2>
        <form action={setDailyGoal} className="grid grid-cols-4 gap-2">
          {DAILY_GOAL_OPTIONS.map(goal => (
            <button
              key={goal}
              type="submit"
              name="goal"
              value={goal}
              className={`py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                user.dailyGoalXp === goal
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {goal} XP
            </button>
          ))}
        </form>
        <p className="text-slate-500 text-xs">
          🧊 Streak freezes : {user.freezeCount} / {MAX_FREEZES} — un freeze protège ta série si tu
          rates un jour ; tu en regagnes un tous les {FREEZE_EARN_EVERY} jours de suite.
        </p>
      </div>

      {/* Achievements */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-300">Badges</h2>
          <span className="text-slate-500 text-sm">{unlockedSlugs.length} / {ACHIEVEMENTS.length}</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {ACHIEVEMENTS.map(ach => {
            const unlocked = unlockedSlugs.includes(ach.slug)
            return (
              <div
                key={ach.slug}
                className={`flex flex-col items-center gap-1 text-center transition-opacity ${unlocked ? 'opacity-100' : 'opacity-30'}`}
                title={ach.description}
              >
                <span className="text-3xl">{ach.icon}</span>
                <span className="text-xs text-slate-400 leading-tight">{ach.name}</span>
              </div>
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
        <button
          type="submit"
          className="w-full py-4 rounded-2xl border border-red-900 text-red-400 hover:bg-red-950 active:scale-95 transition-all cursor-pointer font-semibold"
        >
          Se déconnecter
        </button>
      </form>
    </main>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-900 rounded-2xl p-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-slate-500 text-xs mt-1">{label}</p>
    </div>
  )
}
