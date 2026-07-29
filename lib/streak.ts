// Streak logic — all comparisons in user's local timezone

export const MAX_FREEZES = 2
export const FREEZE_EARN_EVERY = 7 // regain 1 freeze at each 7-day streak milestone

export function toLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('sv-SE', { timeZone: timezone }) // 'sv-SE' gives YYYY-MM-DD
}

function daysBetween(fromDay: string, toDay: string): number {
  // Both YYYY-MM-DD — parsed as UTC midnight, so the diff is an exact day count
  return Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 86400000)
}

export interface StreakUpdate {
  streakCurrent: number
  streakBest: number
  freezeCount: number
  freezesUsed: number
  isFirstStudyOfDay: boolean
}

export function updateStreak(
  lastStudiedAt: Date | null,
  streakCurrent: number,
  streakBest: number,
  timezone: string,
  freezeCount: number
): StreakUpdate {
  const today = toLocalDateString(new Date(), timezone)

  if (!lastStudiedAt) {
    return {
      streakCurrent: 1,
      streakBest: Math.max(1, streakBest),
      freezeCount,
      freezesUsed: 0,
      isFirstStudyOfDay: true,
    }
  }

  const lastDay = toLocalDateString(lastStudiedAt, timezone)
  if (lastDay === today) {
    // Already studied today — no change
    return { streakCurrent, streakBest, freezeCount, freezesUsed: 0, isFirstStudyOfDay: false }
  }

  const missedDays = daysBetween(lastDay, today) - 1

  if (missedDays <= freezeCount) {
    // Streak continues — consume one freeze per missed day (0 if studied yesterday)
    const newStreak = streakCurrent + 1
    let newFreezes = freezeCount - missedDays
    if (newStreak % FREEZE_EARN_EVERY === 0) newFreezes = Math.min(newFreezes + 1, MAX_FREEZES)
    return {
      streakCurrent: newStreak,
      streakBest: Math.max(newStreak, streakBest),
      freezeCount: newFreezes,
      freezesUsed: missedDays,
      isFirstStudyOfDay: true,
    }
  }

  // Too many missed days — reset (freezes are kept)
  return { streakCurrent: 1, streakBest, freezeCount, freezesUsed: 0, isFirstStudyOfDay: true }
}
