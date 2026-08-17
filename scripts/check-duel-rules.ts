// Guards the duel scoring and the round/match resolution, which no UI test
// covers: a wrong `winsNeeded` or a mis-ranked round would silently decide
// matches. Pure functions only — no DB.
import {
  scoreAnswer, maxRoundScore, winsNeeded, POINTS, COMBO_BONUS, COMBO_FROM,
  blitzSeconds, BLITZ_SPEED_BONUS, ROUND_SIZE, ROUND_MIX,
} from '../lib/duel/rules'
import type { ExerciseType } from '../types'
import type { AnswerResult } from '../types'

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.log(`❌ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  } else {
    console.log(`✅ ${label}`)
  }
}

// --- Classic scoring -------------------------------------------------------
check('classic correct', scoreAnswer('CLASSIC', 'correct', { streak: 1 }), POINTS.correct)
check('classic typo is half', scoreAnswer('CLASSIC', 'approximate', { streak: 0 }), POINTS.approximate)
check('classic wrong is zero', scoreAnswer('CLASSIC', 'incorrect', { streak: 0 }), 0)
check(
  'classic combo starts at the threshold',
  scoreAnswer('CLASSIC', 'correct', { streak: COMBO_FROM }),
  POINTS.correct + COMBO_BONUS,
)
check(
  'classic combo not paid below it',
  scoreAnswer('CLASSIC', 'correct', { streak: COMBO_FROM - 1 }),
  POINTS.correct,
)
// A typo never carries the combo — the streak it belongs to is already broken
check(
  'classic combo does not apply to a typo',
  scoreAnswer('CLASSIC', 'approximate', { streak: 9 }),
  POINTS.approximate,
)

// --- Blitz scoring ---------------------------------------------------------
// Every assertion below is written against the QCM clock, the default type
const full = blitzSeconds('QCM') * 1000
check('blitz instant answer', scoreAnswer('BLITZ', 'correct', { msLeft: full }), POINTS.correct + BLITZ_SPEED_BONUS)
check('blitz at the buzzer', scoreAnswer('BLITZ', 'correct', { msLeft: 0 }), POINTS.correct)
// The bonus is measured against half the clock, not the whole of it: a
// generous deadline keeps the exercise possible, a short par keeps it ranking
check(
  'blitz quarter spent',
  scoreAnswer('BLITZ', 'correct', { msLeft: (full * 3) / 4 }),
  POINTS.correct + BLITZ_SPEED_BONUS / 2,
)
check('blitz bonus is gone by mid-clock', scoreAnswer('BLITZ', 'correct', { msLeft: full / 2 }), POINTS.correct)
check('blitz timeout scores nothing', scoreAnswer('BLITZ', 'incorrect', { msLeft: 0 }), 0)
// A clock read after expiry must not pay a bonus, and never a negative one
check('blitz clamps a negative clock', scoreAnswer('BLITZ', 'correct', { msLeft: -5000 }), POINTS.correct)
check('blitz clamps an over-full clock', scoreAnswer('BLITZ', 'correct', { msLeft: full * 3 }), POINTS.correct + BLITZ_SPEED_BONUS)

// --- Per-exercise blitz clocks ----------------------------------------------
// A dictation cannot be heard and typed in the time it takes to tap one of four
// options — that is the whole reason the clock is per type.
check('dictation gets more time than a QCM', blitzSeconds('LISTENING') > blitzSeconds('QCM'), true)
check('typing gets more time than a QCM', blitzSeconds('TYPING') > blitzSeconds('QCM'), true)
check('conjugation gets the longest clock', blitzSeconds('CONJUGATION') >= blitzSeconds('TYPING'), true)
// The bonus is a fraction of the exercise's own budget, so the same *effort*
// pays the same everywhere — otherwise a long clock would be worth more points
const quarterSpent = (type: ExerciseType) =>
  scoreAnswer('BLITZ', 'correct', {
    msLeft: (blitzSeconds(type) * 1000 * 3) / 4,
    exerciseType: type,
  })
check(
  'the same share of any clock is worth the same',
  new Set((['QCM', 'TYPING', 'LISTENING', 'CONJUGATION'] as ExerciseType[]).map(quarterSpent)).size,
  1,
)
// Answering a dictation with 8s left is fast for a QCM and ordinary for a
// dictation: the type is what tells them apart
check(
  'the same time left scores less on a longer clock',
  scoreAnswer('BLITZ', 'correct', { msLeft: full, exerciseType: 'LISTENING' }) <
    scoreAnswer('BLITZ', 'correct', { msLeft: full, exerciseType: 'QCM' }),
  true,
)

// --- A perfect round matches the advertised maximum -------------------------
const perfect = (mode: 'CLASSIC' | 'BLITZ') => {
  let total = 0
  for (let i = 1; i <= ROUND_SIZE; i++) {
    total += scoreAnswer(mode, 'correct', { streak: i, msLeft: full })
  }
  return total
}
check('classic perfect round hits the max', perfect('CLASSIC'), maxRoundScore('CLASSIC'))
check('blitz perfect round hits the max', perfect('BLITZ'), maxRoundScore('BLITZ'))

// --- Round composition ------------------------------------------------------
// The quota list is dealt slot by slot, so a wrong length would silently drop
// or repeat exercises.
check('the mix fills exactly one round', ROUND_MIX.length, ROUND_SIZE)
check('the mix holds no flashcard', ROUND_MIX.includes('FLASHCARD'), false)
// Four options are guessable; a round both players ace decides nothing
check(
  'multiple choice stays a minority',
  ROUND_MIX.filter(t => t === 'QCM').length <= ROUND_SIZE / 2,
  true,
)
check(
  'most slots make the learner produce the answer',
  ROUND_MIX.filter(t => t === 'TYPING' || t === 'LISTENING').length >= ROUND_SIZE / 2,
  true,
)

// --- Match length ----------------------------------------------------------
check('best of 3', winsNeeded(3), 2)
check('best of 5', winsNeeded(5), 3)
check('best of 7', winsNeeded(7), 4)

// --- Round resolution, as lib/duel/service applies it -----------------------
function resolve(mine: number, theirs: number): 'me' | 'them' | 'tie' {
  return mine > theirs ? 'me' : theirs > mine ? 'them' : 'tie'
}
check('higher score takes the round', resolve(78, 62), 'me')
check('lower score loses it', resolve(55, 71), 'them')
check('equal scores give nobody the point', resolve(60, 60), 'tie')

// --- Server-side scoring of a full round ------------------------------------
// The browser reports results, the server recomputes: this is that loop.
function scoreRound(mode: 'CLASSIC' | 'BLITZ', answers: Array<{ result: AnswerResult; msLeft?: number }>) {
  let score = 0
  let streak = 0
  for (const answer of answers) {
    streak = answer.result === 'correct' ? streak + 1 : 0
    score += scoreAnswer(mode, answer.result, { streak, msLeft: answer.msLeft ?? 0 })
  }
  return score
}
// 4 correct in a row (the 3rd and 4th pay the combo), one typo, one wrong
check(
  'a mixed round scores its parts',
  scoreRound('CLASSIC', [
    { result: 'correct' }, { result: 'correct' }, { result: 'correct' }, { result: 'correct' },
    { result: 'approximate' }, { result: 'incorrect' },
  ]),
  4 * POINTS.correct + 2 * COMBO_BONUS + POINTS.approximate,
)
// A wrong answer resets the streak, so the next correct one pays no bonus
check(
  'a mistake resets the combo',
  scoreRound('CLASSIC', [
    { result: 'correct' }, { result: 'correct' }, { result: 'correct' },
    { result: 'incorrect' },
    { result: 'correct' }, { result: 'correct' }, { result: 'correct' },
  ]),
  6 * POINTS.correct + 2 * COMBO_BONUS,
)

console.log(failures === 0 ? '\n✅ duel rules OK' : `\n❌ ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
