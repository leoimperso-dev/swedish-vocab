export interface AchievementDef {
  slug: string
  name: string
  description: string
  icon: string
  xpReward: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    slug: 'first-step',
    name: 'Första steget',
    description: 'Étudie ton premier mot',
    icon: '🌱',
    xpReward: 10,
  },
  {
    slug: 'week-streak',
    name: 'Veckoserie',
    description: '7 jours de suite',
    icon: '🔥',
    xpReward: 50,
  },
  {
    slug: 'month-streak',
    name: 'Månadsserien',
    description: '30 jours de suite',
    icon: '💎',
    xpReward: 200,
  },
  {
    slug: 'hundred-words',
    name: 'Hundra ord',
    description: '100 mots vus',
    icon: '📚',
    xpReward: 30,
  },
  {
    slug: 'perfect-session',
    name: 'Perfekt session',
    description: 'Session parfaite — 15/15',
    icon: '⭐',
    xpReward: 25,
  },
  {
    slug: 'speed-learner',
    name: 'Snabbstuderare',
    description: '50 mots en une journée',
    icon: '⚡',
    xpReward: 40,
  },
  {
    slug: 'verb-master',
    name: 'Verbmästare',
    description: '50 verbes maîtrisés',
    icon: '🎯',
    xpReward: 75,
  },
  {
    slug: 'thousand-words',
    name: 'Tusen ord',
    description: '1000 mots vus',
    icon: '🏆',
    xpReward: 100,
  },
]

export interface AchievementCheckContext {
  totalWordsStudied: number
  streakCurrent: number
  wordsStudiedToday: number
  masteredVerbCount: number
  sessionPerfect: boolean
}

export function checkNewAchievements(
  unlocked: string[],
  ctx: AchievementCheckContext
): AchievementDef[] {
  const newOnes: AchievementDef[] = []
  for (const ach of ACHIEVEMENTS) {
    if (unlocked.includes(ach.slug)) continue
    if (shouldUnlock(ach.slug, ctx)) newOnes.push(ach)
  }
  return newOnes
}

function shouldUnlock(slug: string, ctx: AchievementCheckContext): boolean {
  switch (slug) {
    case 'first-step':    return ctx.totalWordsStudied >= 1
    case 'week-streak':   return ctx.streakCurrent >= 7
    case 'month-streak':  return ctx.streakCurrent >= 30
    case 'hundred-words': return ctx.totalWordsStudied >= 100
    case 'perfect-session': return ctx.sessionPerfect
    case 'speed-learner': return ctx.wordsStudiedToday >= 50
    case 'verb-master':   return ctx.masteredVerbCount >= 50
    case 'thousand-words': return ctx.totalWordsStudied >= 1000
    default: return false
  }
}
