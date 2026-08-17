// Duel rules: sizes, game modes and how an answer turns into points.
//
// Points are the game score and have nothing to do with XP. XP comes from the
// StudySession the round is played as, so a duel round rewards exactly what the
// same ten exercises would reward alone — plus a small bonus, see DUEL_XP.
import type { AnswerResult } from '@/types'

export type DuelMode = 'CLASSIC' | 'BLITZ'
export type DuelStatus = 'ACTIVE' | 'FINISHED' | 'DECLINED'

export const DUEL_MODES: readonly DuelMode[] = ['CLASSIC', 'BLITZ']
export const ROUND_LENGTH_OPTIONS = [3, 5, 7] as const
export const DEFAULT_ROUNDS = 5
/** Exercises in one round, for both players. */
export const ROUND_SIZE = 10
/** New words allowed in a round — the rest is revision, so a duel is not a lesson. */
export const ROUND_NEW_WORDS = 2

export const POINTS: Record<AnswerResult, number> = {
  correct: 10,
  // A spelling slip is not ignorance: half the points (Levenshtein ≤ 2, lib/fuzzy.ts)
  approximate: 5,
  incorrect: 0,
}

/** CLASSIC: a streak of this many correct answers starts paying a bonus. */
export const COMBO_FROM = 3
export const COMBO_BONUS = 2

/** BLITZ: seconds per exercise, and the most a fast answer can add. */
export const BLITZ_SECONDS = 8
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
 */
export function scoreAnswer(
  mode: DuelMode,
  result: AnswerResult,
  { streak = 0, msLeft = 0 }: { streak?: number; msLeft?: number } = {},
): number {
  const base = POINTS[result]
  if (result === 'incorrect') return 0
  if (mode === 'BLITZ') {
    const ratio = Math.max(0, Math.min(1, msLeft / (BLITZ_SECONDS * 1000)))
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
