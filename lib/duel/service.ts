// Duel state machine: who plays next, when a round resolves, when it is over.
//
// The challenger always opens a round; the opponent answers the same round
// number on their own words. When both have played, the round goes to the
// higher score (a tie gives nobody the point) and the next round opens.
import { db } from '@/lib/db'
import { duelRecords } from '@/lib/profile-stats'
import { DUEL_XP, winsNeeded, type DuelMode } from '@/lib/duel/rules'
import { notify } from '@/lib/push'
import { getStrings } from '@/lib/i18n'
import { resolveCourse, type Lang } from '@/lib/courses'
import type { Duel } from '@prisma/client'

export function opponentOf(duel: Duel, userId: string): string {
  return duel.challengerId === userId ? duel.opponentId : duel.challengerId
}

export function isParticipant(duel: Duel, userId: string): boolean {
  return duel.challengerId === userId || duel.opponentId === userId
}

export interface RoundSubmission {
  duel: Duel
  userId: string
  round: number
  score: number
  correct: number
  approx: number
  wrong: number
  sessionId: string
}

export interface RoundOutcome {
  /** Both players have now played this round. */
  resolved: boolean
  /** Round winner once resolved, null on a tie. */
  roundWinnerId: string | null
  duelFinished: boolean
  duelWinnerId: string | null
  yourScore: number
  theirScore: number | null
}

/**
 * Stores one player's round and advances the duel. Returns what the player
 * should be told: whether the other side had already played, and who won.
 */
export async function submitRound(sub: RoundSubmission): Promise<RoundOutcome> {
  const { duel, userId, round } = sub
  const otherId = opponentOf(duel, userId)

  await db.duelRound.create({
    data: {
      duelId: duel.id,
      userId,
      round,
      score: sub.score,
      correct: sub.correct,
      approx: sub.approx,
      wrong: sub.wrong,
      sessionId: sub.sessionId,
    },
  })

  const theirRound = await db.duelRound.findUnique({
    where: { duelId_userId_round: { duelId: duel.id, userId: otherId, round } },
  })

  // First half of the round: hand the turn over and ping them.
  if (!theirRound) {
    await db.duel.update({
      where: { id: duel.id },
      data: { turnUserId: otherId },
    })
    await notifyTurn(duel.id, otherId, userId)
    return {
      resolved: false,
      roundWinnerId: null,
      duelFinished: false,
      duelWinnerId: null,
      yourScore: sub.score,
      theirScore: null,
    }
  }

  // Both played: resolve.
  const roundWinnerId =
    sub.score > theirRound.score ? userId : theirRound.score > sub.score ? otherId : null
  const challengerWins = duel.challengerWins + (roundWinnerId === duel.challengerId ? 1 : 0)
  const opponentWins = duel.opponentWins + (roundWinnerId === duel.opponentId ? 1 : 0)

  const target = winsNeeded(duel.rounds)
  const decided = challengerWins >= target || opponentWins >= target
  const lastRound = round >= duel.rounds
  const finished = decided || lastRound

  const duelWinnerId = !finished
    ? null
    : challengerWins > opponentWins
      ? duel.challengerId
      : opponentWins > challengerWins
        ? duel.opponentId
        : null

  await db.duel.update({
    where: { id: duel.id },
    data: {
      challengerWins,
      opponentWins,
      status: finished ? 'FINISHED' : 'ACTIVE',
      // The challenger opens every round
      turnUserId: finished ? null : duel.challengerId,
      currentRound: finished ? round : round + 1,
      winnerId: duelWinnerId,
      finishedAt: finished ? new Date() : null,
    },
  })

  // Round and duel wins pay XP. The other player is not in this request, so
  // theirs is an increment they will see on their next page load.
  const bonuses = new Map<string, number>()
  if (roundWinnerId) bonuses.set(roundWinnerId, DUEL_XP.roundWin)
  if (duelWinnerId) bonuses.set(duelWinnerId, (bonuses.get(duelWinnerId) ?? 0) + DUEL_XP.duelWin)
  await Promise.all(
    [...bonuses].map(([id, xp]) => db.user.update({ where: { id }, data: { xp: { increment: xp } } })),
  )

  if (finished) await notifyFinished(duel.id, otherId, userId, duelWinnerId)
  else await notifyTurn(duel.id, duel.challengerId, userId)

  return {
    resolved: true,
    roundWinnerId,
    duelFinished: finished,
    duelWinnerId,
    yourScore: sub.score,
    theirScore: theirRound.score,
  }
}

async function nameOf(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  return user?.name ?? '?'
}

/**
 * The recipient's interface language — a notification is written in theirs,
 * not the sender's — and whether they still want duel pushes at all. Both in
 * one read, since every duel notification needs the pair.
 */
async function duelRecipient(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nativeLanguage: true, duelNotifications: true },
  })
  return { t: getStrings(user?.nativeLanguage), wants: user?.duelNotifications ?? true }
}

async function notifyTurn(duelId: string, toUserId: string, fromUserId: string) {
  // The player who just moved may also be the one to move next (they open the
  // next round) — no point pinging someone about their own move.
  if (toUserId === fromUserId) return
  const { t, wants } = await duelRecipient(toUserId)
  if (!wants) return
  const name = await nameOf(fromUserId)
  await notify(toUserId, {
    title: t.pushTurnTitle(name),
    body: t.pushTurnBody,
    url: `/duels/${duelId}`,
    tag: `duel-${duelId}`,
  })
}

async function notifyFinished(
  duelId: string,
  toUserId: string,
  fromUserId: string,
  winnerId: string | null,
) {
  const { t, wants } = await duelRecipient(toUserId)
  if (!wants) return
  const name = await nameOf(fromUserId)
  await notify(toUserId, {
    title: t.pushDuelOverTitle(name),
    body: winnerId === null ? t.duelDraw : winnerId === toUserId ? t.duelWon : t.duelLost,
    url: `/duels/${duelId}`,
    tag: `duel-${duelId}`,
  })
}

/** Duels waiting on this user — the badge on the nav. */
export function pendingDuelCount(userId: string): Promise<number> {
  return db.duel.count({ where: { status: 'ACTIVE', turnUserId: userId } })
}

export interface DuelSummaryRow {
  id: string
  mode: DuelMode
  rounds: number
  status: string
  currentRound: number
  yourTurn: boolean
  yourWins: number
  theirWins: number
  winnerId: string | null
  youWon: boolean | null
  opponent: { id: string; name: string | null; image: string | null }
  /** The opponent's record, so you know who you are up against before playing. */
  opponentRecord: { won: number; played: number; winStreak: number }
  /** What the opponent is drilling — not necessarily what this user studies. */
  opponentLearning: Lang
  updatedAt: string
}

/** Every duel this user is in, most recently moved first. */
export async function listDuels(userId: string): Promise<DuelSummaryRow[]> {
  const duels = await db.duel.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }], status: { not: 'DECLINED' } },
    include: {
      challenger: { select: { id: true, name: true, image: true, nativeLanguage: true, learningLanguage: true } },
      opponent: { select: { id: true, name: true, image: true, nativeLanguage: true, learningLanguage: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  // One pass over the opponents, not one query per row
  const opponentIds = [...new Set(duels.map(d => (d.challengerId === userId ? d.opponentId : d.challengerId)))]
  const records = await duelRecords(opponentIds)

  return duels.map(d => {
    const youAreChallenger = d.challengerId === userId
    const them = youAreChallenger ? d.opponent : d.challenger
    const record = records.get(them.id)
    return {
      id: d.id,
      mode: d.mode as DuelMode,
      rounds: d.rounds,
      status: d.status,
      currentRound: d.currentRound,
      yourTurn: d.turnUserId === userId,
      yourWins: youAreChallenger ? d.challengerWins : d.opponentWins,
      theirWins: youAreChallenger ? d.opponentWins : d.challengerWins,
      winnerId: d.winnerId,
      youWon: d.status !== 'FINISHED' ? null : d.winnerId === null ? null : d.winnerId === userId,
      opponent: { id: them.id, name: them.name, image: them.image },
      opponentRecord: {
        won: record?.won ?? 0,
        played: record?.played ?? 0,
        winStreak: record?.winStreak ?? 0,
      },
      opponentLearning: resolveCourse(them.nativeLanguage, them.learningLanguage).learned,
      updatedAt: d.updatedAt.toISOString(),
    }
  })
}
