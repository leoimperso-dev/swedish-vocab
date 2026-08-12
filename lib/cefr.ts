// CEFR levels, used to decide which new words a learner is served.
//
// The official CEFR describes competence, not word lists, and no free
// per-language list covers Swedish, Dutch and Spanish alike. The level of a
// word is therefore derived from its OpenSubtitles frequency rank, which
// tracks the published English/French lists closely enough to be useful:
// the top few hundred words really are the A1 core, and rank 10000+ really is
// C2 territory. Words with no rank sit at C2 by default.

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type CefrLevel = (typeof CEFR_LEVELS)[number]

// Upper rank bound of each band (inclusive)
const BAND_MAX_RANK: Record<CefrLevel, number> = {
  A1: 600,
  A2: 1200,
  B1: 2500,
  B2: 5000,
  C1: 10000,
  C2: Number.MAX_SAFE_INTEGER,
}

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value)
}

export function cefrForRank(rank: number | null | undefined): CefrLevel {
  if (rank == null || rank <= 0) return 'C2'
  return CEFR_LEVELS.find(level => rank <= BAND_MAX_RANK[level]) ?? 'C2'
}

/**
 * The levels a learner is served new words from: their own and everything
 * above. Words are already ordered by frequency, so a B1 learner meets the
 * easiest B1 words first and only drifts upwards as they progress — the level
 * is a floor, never a cap.
 */
export function levelsAtOrAbove(level: CefrLevel): CefrLevel[] {
  return CEFR_LEVELS.slice(CEFR_LEVELS.indexOf(level))
}

/** Reads User.levels, a { [learnedLanguage]: CefrLevel } map. */
export function levelFor(levels: unknown, learned: string): CefrLevel | null {
  if (!levels || typeof levels !== 'object') return null
  const value = (levels as Record<string, unknown>)[learned]
  return isCefrLevel(value) ? value : null
}
