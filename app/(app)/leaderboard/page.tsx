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

export default function LeaderboardPage() {
  const [users, setUsers] = useState<RankedUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(d => { setUsers(d.leaderboard); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-slate-400">Chargement...</p>
      </main>
    )
  }

  const top3 = users.slice(0, 3)
  const rest = users.slice(3)

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Classement</h1>

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
    </main>
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
