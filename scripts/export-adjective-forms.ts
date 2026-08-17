// Lists the adjectives whose comparative and superlative are missing, for review.
//
// The bulk Wiktionary import brought headwords without their degrees, so a
// flashcard for "mänsklig" shows no forms while "stor" shows "större, störst".
// Only languages whose comparative is a real form are worth a pass: French,
// Spanish and most English adjectives build it with "plus / más / more", which
// is a grammar rule, not a lexical form to store.
//
// Usage: pnpm tsx scripts/export-adjective-forms.ts <out-dir> [pair...]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import type { PairId } from '../lib/courses'

const DEFAULT_PAIRS: PairId[] = ['sv-fr', 'nl-fr', 'en-fr']

async function main() {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Usage: tsx scripts/export-adjective-forms.ts <out-dir> [pair...]')
    process.exit(1)
  }
  const pairs = (process.argv.slice(3) as PairId[])
  const targets = pairs.length > 0 ? pairs : DEFAULT_PAIRS
  fs.mkdirSync(dir, { recursive: true })

  for (const pair of targets) {
    const words = await db.word.findMany({
      where: { pair, wordType: 'ADJECTIVE', studyable: true },
      select: { id: true, term: true, translation: true, forms: true },
      orderBy: { frequencyRank: { sort: 'asc', nulls: 'last' } },
    })

    const missing = words.filter(w => {
      const forms = (w.forms && typeof w.forms === 'object' ? w.forms : {}) as Record<string, string>
      return !forms.comparative || !forms.superlative
    })

    const payload = missing.map((w, i) => ({ i, id: w.id, t: w.term, g: w.translation }))
    const file = path.join(dir, `adjectifs-${pair}.json`)
    fs.writeFileSync(file, JSON.stringify(payload, null, 0), 'utf-8')
    console.log(`${pair}: ${missing.length} adjectifs sans degrés → ${file}`)
  }
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
