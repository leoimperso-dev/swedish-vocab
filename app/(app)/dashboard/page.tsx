import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getLevelForXp, xpToNextLevel } from '@/lib/xp'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  const user = await db.user.findUnique({
    where: { id: session!.user!.id },
    include: {
      wordProgress: {
        where: { nextReview: { lte: new Date() } },
        select: { id: true },
      },
    },
  })

  if (!user) return null

  const level = getLevelForXp(user.xp)
  const { current, needed, progress } = xpToNextLevel(user.xp)
  const dueCount = user.wordProgress.length

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm">Bonjour,</p>
          <h1 className="text-2xl font-bold">{user.name?.split(' ')[0]}</h1>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-orange-400">🔥 {user.streakCurrent}</div>
          <p className="text-slate-500 text-xs">jours de suite</p>
        </div>
      </div>

      {/* Level + XP */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{level.title}</span>
          <span className="text-slate-400 text-sm">Niveau {level.level}</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
        <p className="text-slate-500 text-xs">{current} / {needed || '∞'} XP</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="À revoir" value={dueCount} color="text-yellow-400" />
        <StatCard label="XP total" value={user.xp} color="text-blue-400" />
        <StatCard label="Meilleure série" value={user.streakBest} color="text-orange-400" />
      </div>

      {/* CTA */}
      <Link
        href="/study"
        className="block w-full text-center bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all rounded-2xl py-5 text-lg font-bold cursor-pointer"
      >
        {dueCount > 0 ? `Étudier (${dueCount} mots dus)` : 'Apprendre de nouveaux mots'}
      </Link>

      {/* Streak calendar placeholder */}
      <div className="bg-slate-900 rounded-2xl p-4">
        <h2 className="font-semibold mb-3 text-slate-300">Activité récente</h2>
        <StreakDots streak={user.streakCurrent} />
      </div>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900 rounded-2xl p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-slate-500 text-xs mt-1">{label}</div>
    </div>
  )
}

function StreakDots({ streak }: { streak: number }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className={`w-6 h-6 rounded-md ${i < streak ? 'bg-orange-500' : 'bg-slate-800'}`}
        />
      ))}
    </div>
  )
}
