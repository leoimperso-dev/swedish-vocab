// Checks "I know these perfectly" against the real database, on a throwaway
// account it deletes afterwards.
//
// What could silently break: the ladder is derived from the SM-2 interval, so a
// state that is "high" but under the top rung would show four dots after the
// learner declared they knew the word perfectly — and the words would keep
// coming back. Both paths are covered: a word with no progression yet, and one
// already started in a single direction.
import 'dotenv/config'
import { db } from '../lib/db'
import { markMastered } from '../lib/words/mastered'
import { knowledgeLevel, MAX_KNOWLEDGE_LEVEL } from '../lib/sm2'
import { courseDirections, resolveCourse } from '../lib/courses'

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`)
}

async function main() {
  const course = resolveCourse('fr', 'sv')
  const [first] = courseDirections(course)
  const words = await db.word.findMany({
    where: { pair: course.pair, studyable: true },
    select: { id: true, term: true },
    take: 3,
  })
  const other = await db.word.findFirst({
    where: { pair: { not: course.pair } },
    select: { id: true },
  })
  if (words.length < 3) { console.error('vocabulaire insuffisant'); process.exit(1) }

  const user = await db.user.create({
    data: {
      email: `check-mastered-${Date.now()}@example.invalid`,
      name: 'Check Mastered', nativeLanguage: 'fr', learningLanguage: 'sv',
    },
  })

  try {
    // One word already started and failed: mastering must lift it, not stack on it
    await db.userWord.create({
      data: {
        userId: user.id, wordId: words[0].id, direction: first,
        easeFactor: 1.3, interval: 1, repetitions: 0, nextReview: new Date(),
        incorrectCount: 2, lastResult: 'incorrect',
      },
    })

    const ids = words.map(w => w.id)
    const updated = await markMastered(user.id, course, [...ids, ...(other ? [other.id] : [])])
    check('only the course pair is touched', updated, ids.length)

    const rows = await db.userWord.findMany({
      where: { userId: user.id },
      select: { wordId: true, direction: true, interval: true, repetitions: true },
    })
    check('every word gets both directions', rows.length, ids.length * courseDirections(course).length)
    check(
      'every row reads as fully known',
      rows.every(r => knowledgeLevel(r.interval) === MAX_KNOWLEDGE_LEVEL),
      true,
    )
    // A word already failed had repetitions 0; left there, the next honest
    // review would restart the 1-day ramp instead of continuing
    check('the SM-2 warm-up is over', rows.every(r => r.repetitions > 0), true)
    check(
      'a word already started is lifted, not duplicated',
      rows.filter(r => r.wordId === words[0].id).length,
      courseDirections(course).length,
    )

    // Running it twice must be a no-op, not a doubling
    await markMastered(user.id, course, ids)
    check('re-running changes nothing', (await db.userWord.count({ where: { userId: user.id } })), rows.length)
  } finally {
    await db.userWord.deleteMany({ where: { userId: user.id } })
    await db.user.delete({ where: { id: user.id } })
  }

  console.log(failures === 0 ? '\n✅ mots connus OK' : `\n❌ ${failures} échec(s)`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
