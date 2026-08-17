// Recomputes Word.cefr from Word.frequencyRank — run after apply-frequency.
// Bands live in lib/cefr.ts, which stays the single source of truth.
// Usage: pnpm tsx scripts/assign-cefr.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { CEFR_LEVELS, cefrForRank, type CefrLevel } from '../lib/cefr'
import { lemmaCandidates } from '../lib/morphology'
import { PAIRS, type PairId } from '../lib/courses'

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
   *
   * A phrase is written with inflected words, though, and the vocabulary is
   * keyed by lemma: "neem me niet kwalijk" failed on "neem" (imperative of
   * "nemen") and fell to C2, hiding an A1 courtesy phrase from beginners. So a
   * token that is not a headword is resolved through the same morphology rules
   * the reader uses.
   */
  function rankOfToken(ranks: Map<string, number>, token: string, pair: string): number | undefined {
    const direct = ranks.get(token)
    if (direct != null) return direct
    const lang = PAIRS[pair as PairId]?.term
    if (!lang) return undefined
    for (const candidate of lemmaCandidates(token, lang)) {
      const found = ranks.get(candidate)
      if (found != null) return found
    }
    return undefined
  }

  /**
   * Swedish and Dutch build compounds endlessly, and the frequency list ranks
   * none of them: "campingstuga", "husvagn", "vallblommor" had no rank and fell
   * to C2 with 61% of the vocabulary, so a B2 learner met "caravan" as expert
   * material. A compound is no harder than its hardest part, and its parts are
   * ranked — the same split the reader already uses to look one up.
   */
  function compoundRank(
    ranks: Map<string, number>,
    token: string,
    pair: string,
    depth = 0,
  ): number | undefined {
    const lang = PAIRS[pair as PairId]?.term
    if ((lang !== 'sv' && lang !== 'nl') || token.length < 7 || depth > 1) return undefined
    // Longest prefix first: "sjukhus" is sjuk+hus, not sju+khus
    for (let i = token.length - 3; i >= 3; i--) {
      const head = token.slice(0, i)
      const headRank =
        rankOfToken(ranks, head, pair)
        // Linking -s-: "arbetstimmar" = arbete + s + timmar
        ?? (head.endsWith('s') ? rankOfToken(ranks, head.slice(0, -1), pair) : undefined)
        // The first part may drop its final vowel: "samhälls-" for "samhälle"
        ?? rankOfToken(ranks, head + 'a', pair)
        ?? rankOfToken(ranks, head + 'e', pair)
      if (headRank == null) continue
      const rest = token.slice(i)
      const restRank = rankOfToken(ranks, rest, pair) ?? compoundRank(ranks, rest, pair, depth + 1)
      if (restRank != null) return Math.max(headRank, restRank)
    }
    return undefined
  }

  function levelOfExpression(pair: string, term: string): CefrLevel | null {
    const ranks = rankByPair.get(pair)
    if (!ranks) return null
    const tokens = tokenize(term)
    if (tokens.length < 2) return null
    const ranked = tokens.map(t => rankOfToken(ranks, t, pair))
    if (ranked.some(r => r == null)) return null
    return cefrForRank(Math.max(...(ranked as number[])))
  }

  let inferred = 0
  let compounds = 0
  const idsByLevel = new Map<CefrLevel, string[]>()
  for (const word of words) {
    const tokens = tokenize(word.term)
    const ranks = rankByPair.get(word.pair)
    const fromCompound = tokens.length === 1 && ranks
      ? compoundRank(ranks, tokens[0], word.pair)
      : undefined

    let level: CefrLevel
    if (word.frequencyRank == null) {
      const fromParts = levelOfExpression(word.pair, word.term)
      if (fromParts) {
        level = fromParts
        inferred++
      } else if (fromCompound != null) {
        level = cefrForRank(fromCompound)
        compounds++
      } else {
        level = cefrForRank(null)
      }
    } else {
      // Deliberately NOT lowered to the compound estimate, even when the corpus
      // rank looks too harsh for "husvagn". The splitter accepts any ranked
      // 3-letter prefix, so on a word that is not a compound it invents one:
      // "antigen" as anti+gen, "gedigen" as ge+digen, "besinna" as be+sinna —
      // all three landed in A1 when this was tried. A real corpus rank is
      // evidence; a speculative split is not, and it only decides where there
      // is no rank at all.

      level = cefrForRank(word.frequencyRank)
    }
    if (word.cefr === level) continue
    const bucket = idsByLevel.get(level)
    if (bucket) bucket.push(word.id)
    else idsByLevel.set(level, [word.id])
  }

  console.log(`Expressions scored from their components: ${inferred}`)
  console.log(`Compounds scored from their parts: ${compounds}`)
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
