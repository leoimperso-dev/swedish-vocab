// Why a B1 learner still gets asked "je".
//
// Reports, per pair: how many studyable words sit in each CEFR band, how many
// are still unstudied for the account, and whether a session at each level can
// fill its new-word quota from its own band — because when it cannot, the
// fallback redraws from the WHOLE pair ordered by frequency, which serves the
// most elementary words in the language.
//
// Usage: pnpm tsx scripts/audit-levels.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { CEFR_LEVELS, levelsAtOrAbove, type CefrLevel } from '../lib/cefr'
import { PAIRS, courseDirections, resolveCourse, type PairId } from '../lib/courses'

const NEW_WORDS_PER_SESSION = 5

async function main() {
  const users = await db.user.findMany({
    select: { id: true, email: true, nativeLanguage: true, learningLanguage: true, levels: true },
  })

  for (const pair of Object.keys(PAIRS) as PairId[]) {
    const words = await db.word.groupBy({
      by: ['cefr'],
      where: { pair, studyable: true },
      _count: { _all: true },
    })
    const byBand = new Map(words.map(w => [w.cefr ?? 'null', w._count._all]))
    const total = [...byBand.values()].reduce((a, b) => a + b, 0)
    console.log(`\n=== ${pair} — ${total} mots étudiables`)
    console.log('   ' + [...CEFR_LEVELS, 'null'].map(l => `${l}:${byBand.get(l) ?? 0}`).join('  '))
  }

  for (const user of users) {
    const course = resolveCourse(user.nativeLanguage, user.learningLanguage)
    const levels = (user.levels && typeof user.levels === 'object' ? user.levels : {}) as Record<string, string>
    console.log(`\n\n=== ${user.email} — cours ${course.pair}, niveaux déclarés ${JSON.stringify(levels)}`)

    for (const direction of courseDirections(course)) {
      const studied = await db.userWord.findMany({
        where: { userId: user.id, direction },
        select: { wordId: true },
      })
      const studiedIds = studied.map(s => s.wordId)

      // What the review queue would serve today — unfiltered by level, by design
      const dueByBand = await db.userWord.groupBy({
        by: ['wordId'],
        where: { userId: user.id, direction, nextReview: { lte: new Date() }, word: { pair: course.pair, studyable: true } },
        _count: { _all: true },
      })
      const dueWords = dueByBand.length > 0
        ? await db.word.findMany({
            where: { id: { in: dueByBand.map(d => d.wordId) } },
            select: { cefr: true, term: true, frequencyRank: true },
            orderBy: { frequencyRank: { sort: 'asc', nulls: 'last' } },
          })
        : []
      const dueBands = new Map<string, number>()
      for (const w of dueWords) dueBands.set(w.cefr ?? 'null', (dueBands.get(w.cefr ?? 'null') ?? 0) + 1)

      console.log(`\n  ${direction} — ${studiedIds.length} mots commencés, ${dueWords.length} à revoir aujourd'hui`)
      if (dueWords.length > 0) {
        console.log('     à revoir par bande : ' + [...dueBands].sort().map(([b, n]) => `${b}:${n}`).join('  '))
        console.log('     les plus élémentaires : ' + dueWords.slice(0, 8).map(w => `${w.term}(${w.cefr ?? '-'})`).join(' '))
      }

      // Can each level fill its new-word quota, or does the fallback fire?
      for (const level of CEFR_LEVELS as readonly CefrLevel[]) {
        const available = await db.word.count({
          where: {
            pair: course.pair,
            studyable: true,
            id: { notIn: studiedIds.length > 0 ? studiedIds : undefined },
            cefr: { in: levelsAtOrAbove(level) },
          },
        })
        const fires = available < NEW_WORDS_PER_SESSION
        console.log(`     ${level}: ${available} mots neufs dans la bande${fires ? '  ← REPLI DÉCLENCHÉ (redessine tout le vocabulaire)' : ''}`)
      }
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
