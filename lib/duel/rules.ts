// Duel rules: sizes, game modes and how an answer turns into points.
//
// Points are the game score and have nothing to do with XP. XP comes from the
// StudySession the round is played as, so a duel round rewards exactly what the
// same ten exercises would reward alone — plus a small bonus, see DUEL_XP.
import type { AnswerResult, ExerciseType } from '@/types'

export type DuelMode = 'CLASSIC' | 'BLITZ'
export type DuelStatus = 'ACTIVE' | 'FINISHED' | 'DECLINED'

export const DUEL_MODES: readonly DuelMode[] = ['CLASSIC', 'BLITZ']
export const ROUND_LENGTH_OPTIONS = [3, 5, 7] as const
export const DEFAULT_ROUNDS = 5
/** Exercises in one round, for both players. */
export const ROUND_SIZE = 10
/**
 * The exercise types dealt in one round, one entry per slot. Typing and
 * dictation carry the round because they ask the learner to *produce* the
 * answer; QCM is kept as a minority because four options are easy to guess.
 * Must hold exactly ROUND_SIZE entries — guarded by scripts/check-duel-rules.ts.
 */
export const ROUND_MIX: readonly ExerciseType[] = [
  'TYPING', 'TYPING', 'TYPING', 'TYPING',
  'LISTENING', 'LISTENING', 'LISTENING',
  'QCM', 'QCM', 'QCM',
]

/** How many typing slots may become a cloze or a conjugation, when the word allows. */
export const ROUND_VARIANT_SLOTS = 2

export const POINTS: Record<AnswerResult, number> = {
  correct: 10,
  // A spelling slip is not ignorance: half the points (Levenshtein ≤ 2, lib/fuzzy.ts)
  approximate: 5,
  incorrect: 0,
}

/** CLASSIC: a streak of this many correct answers starts paying a bonus. */
export const COMBO_FROM = 3
export const COMBO_BONUS = 2

/**
 * BLITZ: the clock, per exercise type.
 *
 * A single budget for the whole round was unplayable: eight seconds is brisk
 * for tapping one of four options, and not enough to even hear a dictation
 * before typing it. Each type gets the time its *task* takes — reading a
 * sentence, replaying audio, typing three verb forms — so the pressure is
 * comparable everywhere instead of impossible on half the round.
 */
export const BLITZ_SECONDS: Record<ExerciseType, number> = {
  // Four options are read and tapped — no writing, so the original clock stands
  QCM: 8,
  TYPING: 22,
  // Hearing the word, often twice, before a single character can be typed
  LISTENING: 40,
  // A whole sentence to read before the gap makes sense
  CLOZE: 34,
  // Three forms to type, not one
  CONJUGATION: 40,
  // Self-assessed, so never dealt in a duel — here only to keep the map total
  FLASHCARD: 8,
}

/**
 * The share of the clock a full speed bonus is measured against.
 *
 * The deadline and the bonus answer two different questions. The deadline only
 * has to keep an exercise *possible* — a dictation nobody can finish scores
 * everyone zero and separates nobody. The bonus is what actually ranks two
 * players, and it has to run out well before the deadline does: measured
 * against a generous clock, every honest answer lands near the maximum and the
 * mode stops discriminating, which is the "both players ace it" failure this
 * duel already had once. So: answer within half the clock to earn anything,
 * instantly to earn it all.
 */
export const BLITZ_PAR_RATIO = 0.5

export function blitzSeconds(type: ExerciseType): number {
  return BLITZ_SECONDS[type] ?? BLITZ_SECONDS.QCM
}

/** Shortest and longest clock a duel can deal, for the mode description. */
export const BLITZ_RANGE: [number, number] = [
  Math.min(...ROUND_MIX.map(blitzSeconds)),
  Math.max(...[...ROUND_MIX, 'CLOZE' as ExerciseType, 'CONJUGATION' as ExerciseType].map(blitzSeconds)),
]

export const BLITZ_SPEED_BONUS = 6

export const DUEL_XP = {
  /** Added to the round's session XP, for showing up. */
  round: 3,
  /** Awarded when a round is resolved, to whoever scored highest. */
  roundWin: 2,
  /** Awarded on top when the whole duel is won. */
  duelWin: 10,
} as const

export function isDuelMode(value: unknown): value is DuelMode {
  return value === 'CLASSIC' || value === 'BLITZ'
}

export function roundsCount(value: unknown): number {
  return ROUND_LENGTH_OPTIONS.includes(value as (typeof ROUND_LENGTH_OPTIONS)[number])
    ? (value as number)
    : DEFAULT_ROUNDS
}

/**
 * Points for one answer.
 *
 * @param streak consecutive correct answers *including* this one (CLASSIC)
 * @param msLeft milliseconds left on the clock when answered (BLITZ)
 * @param exerciseType which clock that time is measured against (BLITZ) — the
 *   bonus is a fraction of the exercise's own budget, so answering a dictation
 *   in half its time is worth exactly what acing a QCM in half of its is
 */
export function scoreAnswer(
  mode: DuelMode,
  result: AnswerResult,
  { streak = 0, msLeft = 0, exerciseType = 'QCM' }:
    { streak?: number; msLeft?: number; exerciseType?: ExerciseType } = {},
): number {
  const base = POINTS[result]
  if (result === 'incorrect') return 0
  if (mode === 'BLITZ') {
    const budget = blitzSeconds(exerciseType) * 1000
    const elapsed = Math.max(0, Math.min(budget, budget - msLeft))
    // Full bonus for an instant answer, nothing left by mid-clock — see BLITZ_PAR_RATIO
    const ratio = Math.max(0, 1 - elapsed / (budget * BLITZ_PAR_RATIO))
    return base + Math.round(BLITZ_SPEED_BONUS * ratio)
  }
  return base + (result === 'correct' && streak >= COMBO_FROM ? COMBO_BONUS : 0)
}

/** The highest score a round can reach — used to draw a score bar. */
export function maxRoundScore(mode: DuelMode): number {
  return mode === 'BLITZ'
    ? ROUND_SIZE * (POINTS.correct + BLITZ_SPEED_BONUS)
    : ROUND_SIZE * POINTS.correct + Math.max(0, ROUND_SIZE - COMBO_FROM + 1) * COMBO_BONUS
}

/** Rounds a player must take to be out of reach. */
export function winsNeeded(rounds: number): number {
  return Math.floor(rounds / 2) + 1
}
