'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

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
  isCurrentUser: boolean
}

type Period = 'week' | 'all'

export default function LeaderboardPage() {
  const [users, setUsers] = useState<RankedUser[]>([])
  const [period, setPeriod] = useState<Period>('week')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leaderboard?period=${period}`)
      .then(r => r.json())
      .then(d => { setUsers(d.leaderboard); setLoading(false) })
  }, [period])

  const top3 = users.slice(0, 3)
  const rest = users.slice(3)

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Classement</h1>

      {/* Period tabs */}
      <div className="flex bg-slate-900 rounded-2xl p-1">
        <PeriodTab label="Cette semaine" active={period === 'week'} onClick={() => setPeriod('week')} />
        <PeriodTab label="Général" active={period === 'all'} onClick={() => setPeriod('all')} />
      </div>
      {period === 'week' && (
        <p className="text-slate-500 text-xs -mt-3">XP gagnés depuis lundi — remise à zéro chaque semaine</p>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400">Chargement...</div>
      ) : (
        <>

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="flex items-end justify-center gap-3 py-4">
          <PodiumSlot user={top3[1]} height="h-20" medal="🥈" />
          <PodiumSlot user={top3[0]} height="h-28" medal="🥇" />
          <PodiumSlot user={top3[2]} height="h-16" medal="🥉" />
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {rest.map(user => (
          <div
            key={user.id}
            className={`flex items-center gap-3 p-3 rounded-2xl ${
              user.isCurrentUser ? 'bg-blue-950 border border-blue-700' : 'bg-slate-900'
            }`}
          >
            <span className="text-slate-500 w-6 text-sm text-center">{user.rank}</span>
            <Avatar user={user} size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {user.name}{user.isCurrentUser && <span className="text-blue-400 text-xs ml-2">(toi)</span>}
              </p>
              <p className="text-slate-500 text-xs">{user.levelTitle} · {user.wordsStudied} mots</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-blue-400">{user.xp} XP</p>
              {user.streak > 0 && <p className="text-orange-400 text-xs">🔥 {user.streak}</p>}
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          Sois le premier à étudier !
        </div>
      )}
        </>
      )}
    </main>
  )
}

function PeriodTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
        active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function PodiumSlot({ user, height, medal }: { user: RankedUser; height: string; medal: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-2xl">{medal}</span>
      <Avatar user={user} size={48} />
      <p className="text-xs text-center max-w-16 truncate">{user.name}</p>
      <div className={`w-16 ${height} bg-slate-800 rounded-t-lg flex items-center justify-center`}>
        <span className="text-xs text-slate-400 font-bold">{user.xp}</span>
      </div>
    </div>
  )
}

function Avatar({ user, size }: { user: RankedUser; size: number }) {
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? ''}
        width={size}
        height={size}
        className="rounded-full"
      />
    )
  }
  return (
    <div
      className="rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold"
      style={{ width: size, height: size }}
    >
      {user.name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
