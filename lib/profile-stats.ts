// What one learner's public profile shows: where their XP went, how they fare
// in duels, and when they were last around.
import { db } from '@/lib/db'
import { PAIRS, asPairId, type Lang, type PairId } from '@/lib/courses'

export interface LanguageShare {
  lang: Lang
  words: number
  xp: number
  share: number
}

/**
 * XP per language — an ESTIMATE, and the UI must say so.
 *
 * XP is stored globally on the user and a StudySession does not record which
 * language it drilled, so the split cannot be read anywhere. It is inferred
 * from how the learner's vocabulary is spread across pairs: someone with three
 * quarters of their words in Swedish earned roughly three quarters of their XP
 * there. Exact for the single-language learner, which is most of them.
 */
export async function xpByLanguage(userId: string, totalXp: number): Promise<LanguageShare[]> {
  const rows = await db.userWord.findMany({
    where: { userId },
    select: { word: { select: { pair: true } } },
    distinct: ['wordId'],
  })

  const words = new Map<PairId, number>()
  for (const row of rows) {
    const pair = asPairId(row.word.pair)
    words.set(pair, (words.get(pair) ?? 0) + 1)
  }
  const total = [...words.values()].reduce((sum, n) => sum + n, 0)
  if (total === 0) return []

  return [...words.entries()]
    .map(([pair, count]) => ({
      // A pair is named after the language it teaches
      lang: PAIRS[pair].term,
      words: count,
      xp: Math.round((count / total) * totalXp),
      share: count / total,
    }))
    .sort((a, b) => b.words - a.words)
}

export interface DuelRecord {
  played: number
  won: number
  winStreak: number
  bestWinStreak: number
}

/** Duels finished, won, and the run of wins the learner is on right now. */
export async function duelRecord(userId: string): Promise<DuelRecord> {
  const duels = await db.duel.findMany({
    where: {
      status: 'FINISHED',
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    orderBy: { finishedAt: 'desc' },
    select: { winnerId: true },
  })

  const won = duels.filter(duel => duel.winnerId === userId).length

  // Most recent first: the current streak runs until the first duel not won.
  // A draw (no winner) breaks it — it is a run of wins, not of "not losses".
  let winStreak = 0
  for (const duel of duels) {
    if (duel.winnerId !== userId) break
    winStreak++
  }

  let bestWinStreak = 0
  let run = 0
  for (const duel of duels) {
    run = duel.winnerId === userId ? run + 1 : 0
    bestWinStreak = Math.max(bestWinStreak, run)
  }

  return { played: duels.length, won, winStreak, bestWinStreak }
}

/** Duel records for several learners at once — for a list of opponents. */
export async function duelRecords(userIds: string[]): Promise<Map<string, DuelRecord>> {
  const entries = await Promise.all(
    userIds.map(async id => [id, await duelRecord(id)] as const),
  )
  return new Map(entries)
}
