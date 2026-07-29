'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Suspense } from 'react'

interface SessionData {
  xpGained: number
  newAchievements: Array<{ slug: string; name: string; icon: string }>
  streakCurrent: number
  freezesUsed?: number
  dailyGoal?: { goal: number; xpToday: number; reached: boolean }
  leveledUp: boolean
  newLevel: number
  results: string[]
}

function ResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const data: SessionData = JSON.parse(decodeURIComponent(searchParams.get('data') ?? '{}'))

  const correct = data.results?.filter(r => r === 'correct').length ?? 0
  const approx = data.results?.filter(r => r === 'approximate').length ?? 0
  const incorrect = data.results?.filter(r => r === 'incorrect').length ?? 0
  const total = data.results?.length ?? 0
  const score = Math.round(((correct + approx * 0.5) / Math.max(total, 1)) * 100)

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        {/* Score circle */}
        <div className="space-y-2">
          <div className="text-6xl font-black text-blue-400">{score}%</div>
          <p className="text-slate-400">Session terminée 🎉</p>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-950 border border-green-800 rounded-2xl p-3">
            <div className="text-2xl font-bold text-green-400">{correct}</div>
            <div className="text-xs text-green-600 mt-1">Correct</div>
          </div>
          <div className="bg-yellow-950 border border-yellow-800 rounded-2xl p-3">
            <div className="text-2xl font-bold text-yellow-400">{approx}</div>
            <div className="text-xs text-yellow-600 mt-1">Presque</div>
          </div>
          <div className="bg-red-950 border border-red-800 rounded-2xl p-3">
            <div className="text-2xl font-bold text-red-400">{incorrect}</div>
            <div className="text-xs text-red-600 mt-1">Incorrect</div>
          </div>
        </div>

        {/* XP gained */}
        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <div className="text-2xl font-bold text-yellow-400">+{data.xpGained} XP</div>
          {data.leveledUp && (
            <div className="text-green-400 font-semibold">🆙 Niveau {data.newLevel} débloqué !</div>
          )}
          <div className="text-slate-500 text-sm">Série : {data.streakCurrent} jour{data.streakCurrent > 1 ? 's' : ''} 🔥</div>
          {(data.freezesUsed ?? 0) > 0 && (
            <div className="text-cyan-400 text-sm">🧊 Série sauvée par un streak freeze !</div>
          )}
        </div>

        {/* Daily goal */}
        {data.dailyGoal && (
          <div className={`rounded-2xl p-3 text-sm font-semibold ${
            data.dailyGoal.reached
              ? 'bg-green-950 border border-green-800 text-green-400'
              : 'bg-slate-900 text-slate-400'
          }`}>
            {data.dailyGoal.reached
              ? `🎯 Objectif du jour atteint — ${data.dailyGoal.xpToday} / ${data.dailyGoal.goal} XP`
              : `🎯 Objectif du jour : ${data.dailyGoal.xpToday} / ${data.dailyGoal.goal} XP`}
          </div>
        )}

        {/* New achievements */}
        {data.newAchievements?.length > 0 && (
          <div className="space-y-2">
            <p className="text-slate-400 text-sm">Nouveaux badges !</p>
            {data.newAchievements.map(a => (
              <div key={a.slug} className="bg-slate-900 rounded-xl p-3 flex items-center gap-3">
                <span className="text-2xl">{a.icon}</span>
                <span className="font-semibold">{a.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/study')}
            className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-semibold active:scale-95 transition-all cursor-pointer"
          >
            Nouvelle session
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 font-semibold active:scale-95 transition-all cursor-pointer"
          >
            Retour à l'accueil
          </button>
        </div>
      </motion.div>
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  )
}
