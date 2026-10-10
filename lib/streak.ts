// Streak logic — all comparisons in the user's local timezone.
//
// The streak counts days the learner *showed up*, not days they finished a
// session: revising a word list or reading a story is studying too, and none
// of it closes a StudySession. It is therefore driven from the app layout, on
// `lastSeenAt`, and a session no longer touches it.

export const MAX_FREEZES = 2

export function toLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('sv-SE', { timeZone: timezone }) // 'sv-SE' gives YYYY-MM-DD
}

function daysBetween(fromDay: string, toDay: string): number {
  // Both YYYY-MM-DD — parsed as UTC midnight, so the diff is an exact day count
  return Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 86400000)
}

/** Monday of the week a YYYY-MM-DD day falls in. */
function weekOf(day: string): string {
  const daysSinceMonday = (new Date(day).getUTCDay() + 6) % 7
  return new Date(Date.parse(day) - daysSinceMonday * 86400000).toISOString().slice(0, 10)
}

export interface StreakUpdate {
  streakCurrent: number
  streakBest: number
  freezeCount: number
  freezesUsed: number
  isFirstVisitOfDay: boolean
}

/**
 * Advances the streak for a visit happening now.
 *
 * Freezes refill to MAX_FREEZES at the start of each week rather than being
 * earned by milestones: a bad week used to leave someone defenceless for the
 * next one, which punished exactly the person already struggling to come back.
 */
export function updateStreak(
  lastSeenAt: Date | null,
  streakCurrent: number,
  streakBest: number,
  timezone: string,
  freezeCount: number
): StreakUpdate {
  const today = toLocalDateString(new Date(), timezone)

  if (!lastSeenAt) {
    return {
      streakCurrent: 1,
      streakBest: Math.max(1, streakBest),
      freezeCount: MAX_FREEZES,
      freezesUsed: 0,
      isFirstVisitOfDay: true,
    }
  }

  const lastDay = toLocalDateString(lastSeenAt, timezone)
  // A new week hands back the full allowance before any of it is spent
  const freezes = weekOf(lastDay) === weekOf(today) ? freezeCount : MAX_FREEZES

  if (lastDay === today) {
    // Already seen today — the day is banked, nothing to advance
    return { streakCurrent, streakBest, freezeCount: freezes, freezesUsed: 0, isFirstVisitOfDay: false }
  }

  const missedDays = daysBetween(lastDay, today) - 1

  if (missedDays <= freezes) {
    // Streak continues — one freeze per missed day (none if seen yesterday)
    const newStreak = streakCurrent + 1
    return {
      streakCurrent: newStreak,
      streakBest: Math.max(newStreak, streakBest),
      freezeCount: freezes - missedDays,
      freezesUsed: missedDays,
      isFirstVisitOfDay: true,
    }
  }

  // Too many missed days — start again (the week's freezes are kept)
  return { streakCurrent: 1, streakBest, freezeCount: freezes, freezesUsed: 0, isFirstVisitOfDay: true }
}
