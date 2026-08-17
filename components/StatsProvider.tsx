'use client'

import { createContext, useContext } from 'react'

// Chrome-level numbers, read by the page header and the bottom nav:
// `pendingDuels` is the badge for duels waiting on this player.
export type HeaderStats = { streak: number; freezes: number; xp: number; pendingDuels: number }

const StatsContext = createContext<HeaderStats>({ streak: 0, freezes: 0, xp: 0, pendingDuels: 0 })

export function StatsProvider({ stats, children }: { stats: HeaderStats; children: React.ReactNode }) {
  return <StatsContext.Provider value={stats}>{children}</StatsContext.Provider>
}

export function useStats(): HeaderStats {
  return useContext(StatsContext)
}
