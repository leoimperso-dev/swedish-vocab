// Guards the answer-matching rules of lib/fuzzy.ts.
//
// Entries are inconsistent about articles across languages — "un monstre" is
// stored with one, "monster" without — and many carry several senses. Both had
// the learner marked wrong for a right answer, so the cases below are the
// contract, not decoration.
//
// Usage: pnpm tsx scripts/check-answer-matching.ts
import { evaluateAnswer, type AnswerResult } from '../lib/fuzzy'

const CASES: Array<[input: string, expected: string, want: AnswerResult]> = [
  // Article present on one side only, both directions
  ['a monster', 'monster', 'correct'],
  ['monster', 'a monster', 'correct'],
  ['the cat', 'cat', 'correct'],
  ['le chat', 'chat', 'correct'],
  ['chat', 'le chat', 'correct'],
  ['maison', 'une maison', 'correct'],
  ['flicka', 'en flicka', 'correct'],
  ["l'ami", 'ami', 'correct'],
  ['ami', "l'ami", 'correct'],
  // One sense of a multi-sense gloss answers it
  ['crier', 'crier, aboyer', 'correct'],
  ['aboyer', 'crier, aboyer', 'correct'],
  // Usage notes are read, not typed
  ['école', 'une école (primaire)', 'correct'],
  // Still wrong
  ['chien', 'un chat', 'incorrect'],
  ['gros', 'grand', 'incorrect'],
  ['un', 'un monstre', 'incorrect'],
  ['', 'un chat', 'incorrect'],
  // A typo stays a typo
  ['chats', 'chat', 'approximate'],

  // --- Dictated sentences -------------------------------------------------
  // Punctuation is not vocabulary: none of it may cost the answer
  ['tom est allé à la maison', 'Tom est allé à la maison.', 'correct'],
  ['où est ma valise', 'Où est ma valise ?', 'correct'],
  ["j'ai dit non", "J'ai dit : « non ».", 'correct'],
  ['il ne peut pas venir aujourd hui', "Il ne peut pas venir aujourd'hui.", 'correct'],
  // A name cannot be spelled from hearing it — never graded
  ['marc est allé à la maison', 'Tom est allé à la maison.', 'correct'],
  ['xyz est allé à la maison', 'Tom est allé à la maison.', 'correct'],
  ['est allé à la maison', 'Tom est allé à la maison.', 'correct'],
  ['je vis à sockholm depuis 2 ans', 'Je vis à Stockholm depuis 2 ans.', 'correct'],
  // The first word is capitalised whatever it is, so it stays graded
  ['le chien dort sur le canapé', 'Le chat dort sur le canapé.', 'approximate'],
  // One wrong word is a slip; a sentence understood differently is not
  ['il mange une pomme rouge', 'Il mange une poire rouge.', 'approximate'],
  ['je ne sais pas du tout', 'Il mange une poire rouge.', 'incorrect'],
  ['', 'Tom est allé à la maison.', 'incorrect'],
]

let failures = 0
for (const [input, expected, want] of CASES) {
  const got = evaluateAnswer(input, expected)
  if (got !== want) {
    failures++
    console.error(`ÉCHEC  "${input}" vs "${expected}" → ${got} (attendu ${want})`)
  }
}
console.log(failures === 0 ? `${CASES.length} cas OK` : `${failures}/${CASES.length} échecs`)
process.exit(failures === 0 ? 0 : 1)
