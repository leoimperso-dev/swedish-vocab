// Recomputes Word.cefr from Word.frequencyRank — run after apply-frequency.
// Bands live in lib/cefr.ts, which stays the single source of truth.
// Usage: pnpm tsx scripts/assign-cefr.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { CEFR_LEVELS, cefrForRank, type CefrLevel } from '../lib/cefr'

// Articles and infinitive markers carried by headwords, stripped before lookup
const MARKERS = /^(en|ett|att|to|de|het|el|la|los|las|un|una|le|les)$/

function tokenize(term: string): string[] {
  return term
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"«»]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !MARKERS.test(t))
}

async function main() {
  const words = await db.word.findMany({
    select: { id: true, pair: true, term: true, frequencyRank: true, cefr: true },
  })

  // Rank of every single-word headword, per pair — the basis for scoring the
  // multi-word entries the frequency list can never rank on its own
  const rankByPair = new Map<string, Map<string, number>>()
  for (const word of words) {
    if (word.frequencyRank == null) continue
    const tokens = tokenize(word.term)
    if (tokens.length !== 1) continue
    const map = rankByPair.get(word.pair) ?? new Map<string, number>()
    const known = map.get(tokens[0])
    if (known == null || word.frequencyRank < known) map.set(tokens[0], word.frequencyRank)
    rankByPair.set(word.pair, map)
  }

  /**
   * An expression is as hard as its hardest component: "tener hambre" is
   * tener (A1) + hambre (A2), so A2 — not the C2 an absent rank would imply.
   *
   * Every component has to be known. Ignoring the unknown ones would drag the
   * estimate down ("el paso de peatones" scored A1 off "paso" alone) and drop
   * the entry below the floor of the learners who actually need it.
   */
  function levelOfExpression(pair: string, term: string): CefrLevel | null {
    const ranks = rankByPair.get(pair)
    if (!ranks) return null
    const tokens = tokenize(term)
    if (tokens.length < 2) return null
    const ranked = tokens.map(t => ranks.get(t))
    if (ranked.some(r => r == null)) return null
    return cefrForRank(Math.max(...(ranked as number[])))
  }

  let inferred = 0
  const idsByLevel = new Map<CefrLevel, string[]>()
  for (const word of words) {
    let level = cefrForRank(word.frequencyRank)
    if (word.frequencyRank == null) {
      const fromParts = levelOfExpression(word.pair, word.term)
      if (fromParts) {
        level = fromParts
        inferred++
      }
    }
    if (word.cefr === level) continue
    const bucket = idsByLevel.get(level)
    if (bucket) bucket.push(word.id)
    else idsByLevel.set(level, [word.id])
  }

  console.log(`Expressions scored from their components: ${inferred}`)
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
