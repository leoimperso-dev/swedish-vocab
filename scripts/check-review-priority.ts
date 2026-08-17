// Guards the rule that decides which due words reach a session.
//
// The bug it exists for: a B2 learner spent two thirds of every session on
// "du", "att" and "och", because the declared level gated new words only and
// spaced repetition rescheduled everything already started, forever.
//
// Usage: pnpm tsx scripts/check-review-priority.ts
import { isAtOrAbove, reviewPriority } from '../lib/cefr'

let failures = 0
function check(label: string, condition: boolean) {
  if (!condition) {
    failures++
    console.error(`ÉCHEC  ${label}`)
  }
}

const mastered = { correctCount: 8, incorrectCount: 0, approxCount: 0 }
const shaky = { correctCount: 1, incorrectCount: 4, approxCount: 1 }
const fresh = { correctCount: 0, incorrectCount: 0, approxCount: 0 }

// At or above the declared level: always first in line
check('B2 sur un mot B2', reviewPriority('B2', 'B2', mastered) === 0)
check('B2 sur un mot C1', reviewPriority('C1', 'B2', mastered) === 0)
check('sans niveau déclaré, tout est à égalité', reviewPriority('A1', null, mastered) === 0)

// Below the level: only while it is still being missed
check('B2 sur un A1 maîtrisé passe en dernier', reviewPriority('A1', 'B2', mastered) === 2)
check('B2 sur un A1 encore raté reste en jeu', reviewPriority('A1', 'B2', shaky) === 1)
check('B2 sur un A1 jamais réussi reste en jeu', reviewPriority('A1', 'B2', fresh) === 1)

// A word with no band must never be demoted — that would hide the whole
// unranked tail of the vocabulary
check('mot sans niveau non rétrogradé', reviewPriority(null, 'C1', mastered) === 0)
check('niveau inconnu non rétrogradé', reviewPriority('XX', 'C1', mastered) === 0)

check('isAtOrAbove: A1 sous B1', !isAtOrAbove('A1', 'B1'))
check('isAtOrAbove: C2 au-dessus de B1', isAtOrAbove('C2', 'B1'))
check('isAtOrAbove: égalité', isAtOrAbove('B1', 'B1'))

// The ordering a session actually applies: level first, oldest-due within a tier
// B1 is *below* B2, so a mastered B1 word ranks with the mastered A1 ones —
// consistent with new words, where the level is already a floor and a B2 learner
// is never served fresh B1 vocabulary either.
const pool = [
  { term: 'du', cefr: 'A1', stats: mastered },
  { term: 'inse', cefr: 'B1', stats: fresh },
  { term: 'skriva', cefr: 'B2', stats: mastered },
  { term: 'och', cefr: 'A1', stats: mastered },
  { term: 'ett offer', cefr: 'B1', stats: mastered },
  { term: 'ha', cefr: 'A1', stats: shaky },
]
const ordered = pool
  .map((w, index) => ({ w, priority: reviewPriority(w.cefr, 'B2', w.stats), index }))
  .sort((a, b) => a.priority - b.priority || a.index - b.index)
  .map(e => e.w.term)
check(
  'un B2 voit son niveau, puis ce qu il rate en dessous, puis le reste',
  JSON.stringify(ordered) === JSON.stringify(['skriva', 'inse', 'ha', 'du', 'och', 'ett offer']),
)

console.log(failures === 0 ? 'priorité de révision OK' : `${failures} échec(s)`)
process.exit(failures === 0 ? 0 : 1)
