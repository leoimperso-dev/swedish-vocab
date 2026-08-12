// Exports the bulk Wiktionary entries for a translation review pass.
// Usage: pnpm tsx scripts/export-wiki-glosses.ts <out-dir>
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'

async function main() {
  const out = process.argv[2]
  if (!out) { console.error('Usage: tsx scripts/export-wiki-glosses.ts <out-dir>'); process.exit(1) }

  const words = await db.word.findMany({
    where: { studyable: true, source: { endsWith: '_wiki.txt' } },
    select: { id: true, pair: true, term: true, translation: true, wordType: true, frequencyRank: true },
    orderBy: [{ pair: 'asc' }, { frequencyRank: 'asc' }],
  })

  const byPair = new Map<string, Array<Record<string, unknown>>>()
  for (const w of words) {
    const list = byPair.get(w.pair) ?? []
    // Compact keys: 21k rows go through an agent's context
    list.push({ i: list.length, id: w.id, t: w.term, g: w.translation, p: w.wordType, r: w.frequencyRank })
    byPair.set(w.pair, list)
  }
  for (const [pair, list] of byPair) {
    fs.writeFileSync(`${out}/gloses-${pair}.json`, JSON.stringify(list), 'utf-8')
    console.log(`${pair}: ${list.length} entrées`)
  }
  process.exit(0)
}
main()
