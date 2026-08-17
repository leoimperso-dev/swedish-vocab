// Champion of the week: whoever earned the most XP between two Mondays.
//
// A week is closed once, when it is over, and the result is stored — a title
// already won can never be taken back by a later change to the ranking. There
// is no cron: the first read after a week ends closes it, and the same pass
// catches up any week nobody opened the app during.
//
// Every learner is ranked on the SAME week, in one fixed timezone. Using each
// viewer's own timezone would give players in different countries different
// week boundaries, and a contest whose deadline depends on who is looking is
// not a contest.
import { db } from '@/lib/db'
import { toLocalDateString } from '@/lib/streak'

export const CONTEST_TIMEZONE = 'Europe/Brussels'

// How far back a catch-up will go. A month of silence is a dead app, and
// closing every week since the beginning of time on one request is not worth it.
const MAX_WEEKS_BEHIND = 8

const DAY_MS = 86400000

/** Monday of the week a date falls in, as YYYY-MM-DD in the contest timezone. */
export function weekStartOf(date: Date): string {
  const day = toLocalDateString(date, CONTEST_TIMEZONE)
  const daysSinceMonday = (new Date(day).getUTCDay() + 6) % 7
  return new Date(Date.parse(day) - daysSinceMonday * DAY_MS).toISOString().slice(0, 10)
}

export function currentWeekStart(): string {
  return weekStartOf(new Date())
}

function previousWeek(weekStart: string): string {
  return new Date(Date.parse(weekStart) - 7 * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Closes every finished week that has no result yet, and returns how many.
 *
 * Idempotent: the unique key on [weekStart, userId] means a second pass writes
 * nothing. Ties all win — sharing a title is fairer than awarding it on a
 * tie-break nobody was told about.
 */
export async function closeFinishedWeeks(): Promise<number> {
  const thisWeek = currentWeekStart()
  const lastClosed = await db.weeklyWin.findFirst({
    orderBy: { weekStart: 'desc' },
    select: { weekStart: true },
  })

  // Weeks to consider: everything from the one after the last closed week up to
  // the one that just ended
  const weeks: string[] = []
  for (let week = previousWeek(thisWeek); weeks.length < MAX_WEEKS_BEHIND; week = previousWeek(week)) {
    if (lastClosed && week <= toLocalDateString(lastClosed.weekStart, 'UTC')) break
    weeks.push(week)
  }
  if (weeks.length === 0) return 0

  const oldest = weeks[weeks.length - 1]
  const sessions = await db.studySession.findMany({
    where: { endedAt: { not: null }, startedAt: { gte: new Date(Date.parse(oldest)) } },
    select: { userId: true, startedAt: true, xpGained: true },
  })

  const perWeek = new Map<string, Map<string, number>>()
  for (const session of sessions) {
    const week = weekStartOf(session.startedAt)
    if (week >= thisWeek) continue // the running week is not over
    const board = perWeek.get(week) ?? new Map<string, number>()
    board.set(session.userId, (board.get(session.userId) ?? 0) + session.xpGained)
    perWeek.set(week, board)
  }

  let closed = 0
  for (const week of weeks) {
    const board = perWeek.get(week)
    if (!board) continue
    const best = Math.max(...board.values())
    if (best <= 0) continue // a week nobody earned anything in has no champion
    for (const [userId, xp] of board) {
      if (xp !== best) continue
      await db.weeklyWin.upsert({
        where: { weekStart_userId: { weekStart: new Date(week), userId } },
        create: { userId, weekStart: new Date(week), xp },
        update: {},
      })
      closed++
    }
  }
  return closed
}

/** How many weeks each of these learners has topped. */
export async function weeklyWinCounts(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()
  const rows = await db.weeklyWin.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _count: { _all: true },
  })
  return new Map(rows.map(row => [row.userId, row._count._all]))
}
