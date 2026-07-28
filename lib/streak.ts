// Streak logic — all comparisons in user's local timezone

function toLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('sv-SE', { timeZone: timezone }) // 'sv-SE' gives YYYY-MM-DD
}

export function updateStreak(
  lastStudiedAt: Date | null,
  streakCurrent: number,
  streakBest: number,
  timezone: string
): { streakCurrent: number; streakBest: number; isFirstStudyOfDay: boolean } {
  const today = toLocalDateString(new Date(), timezone)

  if (!lastStudiedAt) {
    return { streakCurrent: 1, streakBest: Math.max(1, streakBest), isFirstStudyOfDay: true }
  }

  const lastDay = toLocalDateString(lastStudiedAt, timezone)
  if (lastDay === today) {
    // Already studied today — no change
    return { streakCurrent, streakBest, isFirstStudyOfDay: false }
  }

  const yesterday = toLocalDateString(
    new Date(Date.now() - 86400000),
    timezone
  )

  if (lastDay === yesterday) {
    // Studied yesterday — continue streak
    const newStreak = streakCurrent + 1
    return { streakCurrent: newStreak, streakBest: Math.max(newStreak, streakBest), isFirstStudyOfDay: true }
  }

  // Missed a day — reset
  return { streakCurrent: 1, streakBest: streakBest, isFirstStudyOfDay: true }
}
