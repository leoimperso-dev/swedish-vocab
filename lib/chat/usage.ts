// Two guards on one row: how many turns a learner has spent today, and how
// long ago the last one was.
//
// Groq's budget is shared by everyone, so a single client stuck in a loop can
// starve the app before any 429 comes back to slow it down.
import { db } from '@/lib/db'

export const DAILY_LIMIT = 60
// Below the pace of anyone actually typing or speaking an answer, so invisible
// in normal use and a hard stop for anything automated
export const MIN_INTERVAL_MS = 4000

export type Reservation =
  | { ok: true; used: number }
  | { ok: false; reason: 'too_fast'; retryAfterSec: number }
  | { ok: false; reason: 'daily_limit'; limit: number }

// UTC, deliberately: a shifted midnight means nothing to an abuse cap, and the
// learner's timezone would cost another query. Streaks do it properly because
// there the boundary is the point (see lib/streak.ts).
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Claims one turn before spending it. Counted up front so two tabs cannot both
 * pass the check, and given back by `releaseChatTurn` if the turn never happened.
 */
export async function reserveChatTurn(userId: string): Promise<Reservation> {
  const day = today()
  const row = await db.chatUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, messageCount: 0 },
    update: {},
  })

  const since = row.lastMessageAt ? Date.now() - row.lastMessageAt.getTime() : Infinity
  if (since < MIN_INTERVAL_MS) {
    return { ok: false, reason: 'too_fast', retryAfterSec: Math.ceil((MIN_INTERVAL_MS - since) / 1000) }
  }
  if (row.messageCount >= DAILY_LIMIT) {
    return { ok: false, reason: 'daily_limit', limit: DAILY_LIMIT }
  }

  const updated = await db.chatUsage.update({
    where: { userId_day: { userId, day } },
    data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
  })
  return { ok: true, used: updated.messageCount }
}

/**
 * Gives a claimed turn back. Used when every model was saturated: the learner
 * got nothing, so their own quota should not pay for our capacity problem.
 */
export async function releaseChatTurn(userId: string): Promise<void> {
  try {
    await db.chatUsage.update({
      where: { userId_day: { userId, day: today() } },
      data: { messageCount: { decrement: 1 } },
    })
  } catch {
    // Refunding a turn is a courtesy — never let it fail the request
  }
}
