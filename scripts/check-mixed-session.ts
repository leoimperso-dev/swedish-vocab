// Checks a MIXED solo session against the real database.
//
// The risk this guards is silent: a card drawn from the FR→SV schedule but
// asked (and credited) as SV→FR would advance a schedule that was not due, and
// nothing in the UI would show it. So every exercise is matched back to the
// UserWord row it came from.
//
// Usage: pnpm tsx scripts/check-mixed-session.ts <email>
import 'dotenv/config'
import { db } from '../lib/db'
import { levelFor } from '../lib/cefr'
import { buildExercises } from '../lib/study/build'
import { answerLang, courseDirections, resolveCourse } from '../lib/courses'

const SESSION_SIZE = 15

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('usage: pnpm tsx scripts/check-mixed-session.ts <email>'); process.exit(1) }
  const user = await db.user.findFirst({ where: { email } })
  if (!user) { console.error('compte introuvable'); process.exit(1) }

  const course = resolveCourse(user.nativeLanguage, user.learningLanguage)
  const level = levelFor(user.levels, course.learned)
  const both = courseDirections(course)

  const exercises = await buildExercises({
    userId: user.id, course, level,
    direction: 'MIXED', size: SESSION_SIZE, newWords: 5,
  })

  console.log(`\n=== ${email} — ${course.pair}, sens mixte`)
  for (const ex of exercises) {
    console.log(`  ${ex.direction}  ${ex.exerciseType.padEnd(11)} ${ex.word.term}`)
  }

  check('la session est pleine', exercises.length === SESSION_SIZE, `${exercises.length}/${SESSION_SIZE}`)
  check(
    'chaque sens appartient au cours',
    exercises.every(ex => ex.direction && both.includes(ex.direction)),
  )
  check(
    'aucun mot demandé deux fois',
    new Set(exercises.map(e => e.word.id)).size === exercises.length,
  )

  // The invariant that matters: an exercise on a scheduled card is asked in
  // that card's own direction.
  const scheduled = await db.userWord.findMany({
    where: { userId: user.id, wordId: { in: exercises.map(e => e.word.id) } },
    select: { wordId: true, direction: true },
  })
  const known = new Map<string, string[]>()
  for (const row of scheduled) known.set(row.wordId, [...(known.get(row.wordId) ?? []), row.direction])
  // Dictation, cloze and conjugation are the exception: they can only be
  // answered in the language being learned, so they always carry that
  // direction even when the card was scheduled the other way — the card simply
  // stays due. See exerciseDirection in lib/study/build.ts.
  const producesLearned = ['LISTENING', 'CLOZE', 'CONJUGATION']
  const mismatched = exercises.filter(ex => {
    if (producesLearned.includes(ex.exerciseType)) return false
    const dirs = known.get(ex.word.id)
    return dirs && !dirs.includes(ex.direction!)
  })
  check(
    'un mot déjà étudié est demandé dans le sens où il est programmé',
    mismatched.length === 0,
    mismatched.map(m => `${m.word.term}:${m.direction}`).join(', '),
  )
  check(
    'dictée, texte à trou et conjugaison répondent dans la langue apprise',
    exercises
      .filter(ex => producesLearned.includes(ex.exerciseType))
      .every(ex => answerLang(ex.direction!) === course.learned),
  )

  const spread = both.map(d => `${d}:${exercises.filter(e => e.direction === d).length}`).join('  ')
  console.log(`\n  répartition — ${spread}`)

  console.log(failures === 0 ? '\n✅ session mixte OK' : `\n❌ ${failures} échec(s)`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
