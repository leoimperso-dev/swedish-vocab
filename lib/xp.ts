import type { Lang } from '@/lib/courses'

// Thresholds are sized for the current rewards (~15-20 XP for a full session).
// They were left at their old values when the per-answer rewards were divided
// by ten, which made every rank reachable in a handful of sessions.
const BASE_THRESHOLDS = [0, 200, 600, 1500, 3500, 7000, 15000] as const

// Past the last rank the ladder does not stop: it continues as numbered
// masteries, borrowed from the dan system, so long-term learners keep a target.
const DAN_STEP = 10000

/**
 * Rank names in the language being learned — progressing teaches the words.
 * Every learnable language of COURSES needs an entry; the last name is the one
 * the numbered masteries build on.
 */
const TITLES: Record<Lang, readonly string[]> = {
  sv: ['Nybörjare', 'Elev', 'Student', 'Talare', 'Avancerad', 'Expert', 'Mästare'],
  en: ['Beginner', 'Learner', 'Student', 'Speaker', 'Advanced', 'Expert', 'Master'],
  nl: ['Beginner', 'Leerling', 'Student', 'Spreker', 'Gevorderd', 'Expert', 'Meester'],
  es: ['Principiante', 'Aprendiz', 'Estudiante', 'Hablante', 'Avanzado', 'Experto', 'Maestro'],
  fr: ['Débutant', 'Apprenti', 'Étudiant', 'Locuteur', 'Avancé', 'Expert', 'Maître'],
  de: ['Anfänger', 'Lernender', 'Student', 'Sprecher', 'Fortgeschritten', 'Experte', 'Meister'],
}

// A full session is worth ~20 XP, so anything under 15 is reached before the
// learner has done a day's work. The presets are suggestions — the goal itself
// is free between the two bounds.
export const MIN_DAILY_GOAL = 15
export const MAX_DAILY_GOAL = 500
export const DAILY_GOAL_PRESETS = [15, 25, 40, 60] as const

export interface LevelInfo {
  level: number
  minXp: number
  // 1 for the base ranks and the first mastery, 2+ for each mastery beyond it
  dan: number
}

export const XP_REWARDS = {
  correct: 1,
  approximate: 0.5,
  incorrect: 0,
  firstStudyOfDay: 2,
  perfectSession: 5,
  comboMultiplier: 1.5, // applied after 3 consecutive correct
} as const

const TOP_LEVEL = BASE_THRESHOLDS.length
const TOP_MIN_XP = BASE_THRESHOLDS[TOP_LEVEL - 1]

const ROMAN: Array<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

function roman(n: number): string {
  let rest = n
  let out = ''
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) { out += numeral; rest -= value }
  }
  return out
}

export function levelAt(level: number): LevelInfo {
  if (level <= TOP_LEVEL) return { level, minXp: BASE_THRESHOLDS[level - 1], dan: 1 }
  const dan = level - TOP_LEVEL + 1
  return { level, minXp: TOP_MIN_XP + (dan - 1) * DAN_STEP, dan }
}

export function getLevelForXp(xp: number): LevelInfo {
  if (xp < TOP_MIN_XP) {
    for (let i = BASE_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= BASE_THRESHOLDS[i]) return levelAt(i + 1)
    }
    return levelAt(1)
  }
  return levelAt(TOP_LEVEL + Math.floor((xp - TOP_MIN_XP) / DAN_STEP))
}

/** The rank name, in the language being learned. */
export function levelTitle(info: LevelInfo, learned: Lang): string {
  const names = TITLES[learned] ?? TITLES.en
  if (info.level <= TOP_LEVEL) return names[info.level - 1]
  return `${names[names.length - 1]} ${roman(info.dan)}`
}

/** Always exists — the numbered masteries have no ceiling. */
export function getNextLevel(currentLevel: number): LevelInfo {
  return levelAt(currentLevel + 1)
}

export function xpToNextLevel(xp: number): { current: number; needed: number; progress: number } {
  const current = getLevelForXp(xp)
  const next = getNextLevel(current.level)
  const needed = next.minXp - current.minXp
  return { current: xp - current.minXp, needed, progress: (xp - current.minXp) / needed }
}

/**
 * The ranks to draw on the profile roadmap: the named ones, plus the masteries
 * already reached and the one being climbed.
 */
export function levelLadder(learned: Lang, xp: number): Array<LevelInfo & { title: string }> {
  const reached = getLevelForXp(xp).level
  const last = Math.max(TOP_LEVEL, reached + 1)
  return Array.from({ length: last }, (_, i) => {
    const info = levelAt(i + 1)
    return { ...info, title: levelTitle(info, learned) }
  })
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
      if (consecutive > 3) combo += xp * (XP_REWARDS.comboMultiplier - 1)
    } else {
      consecutive = 0
    }
  }
  // Rewards are fractional at this scale — the stored total stays an integer
  base = Math.round(base)
  combo = Math.round(combo)

  const allCorrect = results.every(r => r === 'correct')
  const perfectBonus = allCorrect && results.length >= 15 ? XP_REWARDS.perfectSession : 0
  const dayBonus = isFirstStudyOfDay ? XP_REWARDS.firstStudyOfDay : 0
  const bonus = perfectBonus + dayBonus

  return { total: base + combo + bonus, breakdown: { base, combo, bonus } }
}
