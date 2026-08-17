// Shows what a session would actually serve, for one account and direction.
//
// The band counts alone never settle "why am I asked easy words at B2": the
// answer depends on the review queue, which mixes in everything already
// started. This replays the same selection the route performs.
//
// Usage: pnpm tsx scripts/simulate-session.ts <email> [direction]
import 'dotenv/config'
import { db } from '../lib/db'
import { CEFR_LEVELS, levelFor, levelsAtOrAbove, reviewPriority } from '../lib/cefr'
import { courseDirections, resolveCourse } from '../lib/courses'
import { PAIRS, type PairId } from '../lib/courses'

const SESSION_SIZE = 15
const NEW_WORDS_PER_SESSION = 5
const DUE_POOL_SIZE = 200

async function main() {
  console.log('=== mots étudiables par bande')
  for (const pair of Object.keys(PAIRS) as PairId[]) {
    const rows = await db.word.groupBy({
      by: ['cefr'], where: { pair, studyable: true }, _count: { _all: true },
    })
    const by = new Map(rows.map(r => [r.cefr ?? 'null', r._count._all]))
    const total = [...by.values()].reduce((a, b) => a + b, 0)
    console.log(`  ${pair}  ` + CEFR_LEVELS.map(l => `${l}:${String(by.get(l) ?? 0).padStart(5)}`).join('  ') + `   total ${total}`)
  }

  const email = process.argv[2]
  if (!email) { console.log('\n(passer un email pour simuler une session)'); process.exit(0) }
  const user = await db.user.findFirst({ where: { email } })
  if (!user) { console.error('compte introuvable'); process.exit(1) }
  const course = resolveCourse(user.nativeLanguage, user.learningLanguage)
  const level = levelFor(user.levels, course.learned)
  const direction = (process.argv[3] as string) ?? courseDirections(course)[0]
  console.log(`\n=== ${email} — ${course.pair}, niveau ${level ?? 'non déclaré'}, sens ${direction}`)

  const duePool = await db.userWord.findMany({
    where: { userId: user.id, direction, nextReview: { lte: new Date() }, word: { pair: course.pair, studyable: true } },
    include: { word: true },
    orderBy: { nextReview: 'asc' },
    take: DUE_POOL_SIZE,
  })
  const due = duePool
    .map((uw, index) => ({ uw, priority: reviewPriority(uw.word.cefr, level, uw), index }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, SESSION_SIZE - NEW_WORDS_PER_SESSION)

  console.log(`\n  révisions retenues (${due.length} sur ${duePool.length} dues) :`)
  for (const d of due) {
    console.log(`    [${d.uw.word.cefr}] p${d.priority}  ${d.uw.word.term}  (${d.uw.correctCount}✓ ${d.uw.incorrectCount}✗)`)
  }

  const studiedIds = (await db.userWord.findMany({
    where: { userId: user.id, direction }, select: { wordId: true },
  })).map(s => s.wordId)
  const newWords = await db.word.findMany({
    where: {
      pair: course.pair, studyable: true,
      id: { notIn: studiedIds.length > 0 ? studiedIds : undefined },
      ...(level ? { cefr: { in: levelsAtOrAbove(level) } } : {}),
    },
    select: { term: true, cefr: true, frequencyRank: true },
    take: NEW_WORDS_PER_SESSION,
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  console.log(`\n  mots neufs :`)
  for (const w of newWords) console.log(`    [${w.cefr}] #${w.frequencyRank ?? '-'}  ${w.term}`)

  const easy = due.filter(d => d.uw.word.cefr === 'A1' || d.uw.word.cefr === 'A2').length
  console.log(`\n  → ${easy} carte(s) A1/A2 sur ${due.length + newWords.length}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
