// How a duel round spreads its exercise types.
//
// Left to the solo picker, a round drifted to almost pure QCM: an unseen word
// can only be served as a multiple choice, and four options are easy enough
// that both players max the round and every match ends in a draw. A duel needs
// exercises that actually separate two people, so the types are dealt from
// fixed quotas instead of chosen per word.
import { shuffleInPlace } from '@/lib/study/build'
import { ROUND_MIX, ROUND_VARIANT_SLOTS } from '@/lib/duel/rules'
import type { ExerciseType } from '@/types'

export interface MixCandidate {
  /** Never studied in this direction — see below. */
  isNew: boolean
  clozeEligible: boolean
  conjugationEligible: boolean
}

/**
 * Assigns one exercise type per candidate, in order.
 *
 * QCM, typing and dictation fit any word, so the quota is always satisfiable;
 * cloze and conjugation need the right word and only ever replace a typing
 * slot, which is the closest in difficulty.
 *
 * A word the player has never met is forced to QCM: asking someone to spell a
 * word they have never seen scores zero for skill reasons that have nothing to
 * do with the duel. The round builder caps how many of those it draws.
 */
export function assignDuelTypes(candidates: MixCandidate[]): ExerciseType[] {
  const slots = dealSlots(candidates.length)
  const types = candidates.map((candidate, i) => (candidate.isNew ? 'QCM' : slots[i]))

  // Turn a couple of typing slots into their richer variants where the word
  // allows it, so a round is not four identical prompts in a row.
  let variants = 0
  for (let i = 0; i < candidates.length && variants < ROUND_VARIANT_SLOTS; i++) {
    if (types[i] !== 'TYPING') continue
    const candidate = candidates[i]
    if (candidate.conjugationEligible) types[i] = 'CONJUGATION'
    else if (candidate.clozeEligible) types[i] = 'CLOZE'
    else continue
    variants++
  }

  return types
}

/** One shuffled slot per exercise, repeating the quota if the round is longer. */
function dealSlots(count: number): ExerciseType[] {
  const slots: ExerciseType[] = []
  while (slots.length < count) slots.push(...ROUND_MIX)
  return shuffleInPlace(slots).slice(0, count)
}
