// Recomputes Word.cefr from Word.frequencyRank — run after apply-frequency.
// Bands live in lib/cefr.ts, which stays the single source of truth.
// Usage: pnpm tsx scripts/assign-cefr.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { CEFR_LEVELS, cefrForRank } from '../lib/cefr'

async function main() {
  const words = await db.word.findMany({ select: { id: true, frequencyRank: true, cefr: true } })

  // One UPDATE per band instead of one per word — 6 statements for ~50k rows
  const idsByLevel = new Map<string, string[]>()
  for (const word of words) {
    const level = cefrForRank(word.frequencyRank)
    if (word.cefr === level) continue
    const bucket = idsByLevel.get(level)
    if (bucket) bucket.push(word.id)
    else idsByLevel.set(level, [word.id])
  }

  for (const [level, ids] of idsByLevel) {
    await db.word.updateMany({ where: { id: { in: ids } }, data: { cefr: level } })
    console.log(`  ${level}: ${ids.length} updated`)
  }
  if (idsByLevel.size === 0) console.log('  already up to date')

  const rows = await db.$queryRawUnsafe<Array<{ pair: string; cefr: string; n: bigint }>>(
    `SELECT pair, cefr, count(*) AS n FROM "Word" WHERE studyable GROUP BY pair, cefr ORDER BY pair, cefr`)
  const byPair = new Map<string, Map<string, bigint>>()
  for (const r of rows) {
    const bands = byPair.get(r.pair) ?? new Map()
    bands.set(r.cefr, r.n)
    byPair.set(r.pair, bands)
  }
  for (const [pair, bands] of byPair) {
    console.log(pair.padEnd(6), CEFR_LEVELS.map(l => `${l}:${bands.get(l) ?? 0}`).join('  '))
  }
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
