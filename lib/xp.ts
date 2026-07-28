export const LEVELS = [
  { level: 1, minXp: 0,     title: 'Nybörjare' },
  { level: 2, minXp: 200,   title: 'Elev' },
  { level: 3, minXp: 600,   title: 'Student' },
  { level: 4, minXp: 1500,  title: 'Talare' },
  { level: 5, minXp: 3500,  title: 'Avancerad' },
  { level: 6, minXp: 7000,  title: 'Expert' },
  { level: 7, minXp: 15000, title: 'Mästare' },
] as const

export const XP_REWARDS = {
  correct: 10,
  approximate: 5,
  incorrect: 0,
  firstStudyOfDay: 20,
  perfectSession: 50,
  comboMultiplier: 1.5, // applied after 3 consecutive correct
} as const

export function getLevelForXp(xp: number): typeof LEVELS[number] {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXp) return LEVELS[i]
  }
  return LEVELS[0]
}

export function getNextLevel(currentLevel: number): typeof LEVELS[number] | null {
  return LEVELS.find(l => l.level === currentLevel + 1) ?? null
}

export function xpToNextLevel(xp: number): { current: number; needed: number; progress: number } {
  const current = getLevelForXp(xp)
  const next = getNextLevel(current.level)
  if (!next) return { current: xp - current.minXp, needed: 0, progress: 1 }
  const needed = next.minXp - current.minXp
  const progress = (xp - current.minXp) / needed
  return { current: xp - current.minXp, needed, progress }
}

export function calculateSessionXp(
  results: Array<'correct' | 'approximate' | 'incorrect'>,
  isFirstStudyOfDay: boolean
): { total: number; breakdown: { base: number; combo: number; bonus: number } } {
  let base = 0
  let combo = 0
  let consecutive = 0

  for (const result of results) {
    const xp = XP_REWARDS[result]
    base += xp
    if (result === 'correct') {
      consecutive++
      if (consecutive > 3) combo += Math.floor(xp * (XP_REWARDS.comboMultiplier - 1))
    } else {
      consecutive = 0
    }
  }

  const allCorrect = results.every(r => r === 'correct')
  const perfectBonus = allCorrect && results.length >= 15 ? XP_REWARDS.perfectSession : 0
  const dayBonus = isFirstStudyOfDay ? XP_REWARDS.firstStudyOfDay : 0
  const bonus = perfectBonus + dayBonus

  return { total: base + combo + bonus, breakdown: { base, combo, bonus } }
}
