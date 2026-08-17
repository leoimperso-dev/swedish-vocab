// Reports which adjectives and verbs are missing the forms their language drills.
//
// The conjugation exercise and the dictionary popover both read Word.forms, so a
// missing comparative is a hole in the content, not a display bug.
//
// Usage: pnpm tsx scripts/audit-forms.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { PAIRS, type PairId } from '../lib/courses'

const ADJECTIVE_FORMS = ['comparative', 'superlative'] as const

async function main() {
  const words = await db.word.findMany({
    where: { wordType: 'ADJECTIVE' },
    select: { pair: true, term: true, forms: true, studyable: true, frequencyRank: true, source: true },
    orderBy: { frequencyRank: { sort: 'asc', nulls: 'last' } },
  })

  for (const pair of Object.keys(PAIRS) as PairId[]) {
    const ofPair = words.filter(w => w.pair === pair)
    if (ofPair.length === 0) continue
    const complete = ofPair.filter(w => {
      const forms = (w.forms && typeof w.forms === 'object' ? w.forms : {}) as Record<string, string>
      return ADJECTIVE_FORMS.every(key => forms[key])
    })
    const missing = ofPair.filter(w => !complete.includes(w) && w.studyable)
    console.log(
      `${pair}: ${ofPair.length} adjectifs — ${complete.length} complets, ${missing.length} studyable sans comparatif`,
    )
    console.log('   ' + missing.slice(0, 15).map(w => `${w.term}(${w.frequencyRank ?? '?'})`).join(' '))
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
