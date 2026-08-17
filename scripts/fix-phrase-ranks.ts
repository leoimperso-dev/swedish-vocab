// Clears frequency ranks that a phrase inherited from its first word.
//
// `buildKeys` in apply-frequency.ts used to hand any multi-word entry the rank
// of its first token, so "Är bron genom Överföring av kompetens" took the rank
// of "är" (3) and landed in A1 — served to B2 learners as elementary
// vocabulary. The script is fixed; this repairs what it already wrote.
//
// A rank is implausible for a phrase of three words or more: no such string
// appears in a single-token frequency list. The rank is cleared, because it
// poisons every frequency ordering.
//
// The band is then recomputed by `assign-cefr.ts`, which already scores an
// expression by its hardest component rather than by a rank — so "neem me niet
// kwalijk" stays A1 where it belongs, instead of inheriting the rank of "neem"
// or being dumped into C2. **Run assign-cefr.ts straight after this.**
//
// Full sentences are a different problem and are only reported here, not
// touched: whether "Natten varar flera månader" belongs in a vocabulary list is
// a judgement call, not a rule.
//
// Usage: pnpm tsx scripts/fix-phrase-ranks.ts [--apply]
import 'dotenv/config'
import { db } from '../lib/db'
import { headwordKey } from '../lib/morphology'
import { PAIRS, type PairId } from '../lib/courses'

// Two-word units are ranked on their first token on purpose — see apply-frequency
const MIN_TOKENS = 3

async function main() {
  const apply = process.argv.includes('--apply')
  let total = 0
  const samples: string[] = []
  const sentences: string[] = []

  for (const pair of Object.keys(PAIRS) as PairId[]) {
    const lang = PAIRS[pair].term
    const words = await db.word.findMany({
      where: { pair, frequencyRank: { not: null } },
      select: { id: true, term: true, translation: true, frequencyRank: true, cefr: true },
      orderBy: { frequencyRank: 'asc' },
    })

    const bad = words.filter(w => headwordKey(w.term, lang).split(/\s+/).length >= MIN_TOKENS)
    console.log(`${pair}: ${bad.length} expressions de ${MIN_TOKENS}+ mots portant un rang`)
    for (const w of bad.slice(0, 6)) {
      samples.push(`${pair} [${w.cefr}] #${w.frequencyRank} « ${w.term} » → ${w.translation}`)
    }
    total += bad.length

    // Five words or more, and the translation reads like a clause: probably a
    // sentence that slipped into a vocabulary file
    for (const w of bad) {
      if (headwordKey(w.term, lang).split(/\s+/).length >= 5) {
        sentences.push(`${pair} « ${w.term} » → ${w.translation}`)
      }
    }

    if (apply && bad.length > 0) {
      for (const w of bad) {
        await db.word.update({ where: { id: w.id }, data: { frequencyRank: null } })
      }
    }
  }

  console.log(`\nÉchantillon :`)
  for (const s of samples.slice(0, 15)) console.log('  ' + s)
  if (sentences.length > 0) {
    console.log(`\nÀ regarder à la main — ressemblent à des phrases, pas à du vocabulaire :`)
    for (const s of sentences) console.log('  ' + s)
  }
  console.log(`\n${apply ? 'Appliqué' : 'Simulation'} — ${total} rangs effacés, à recalculer avec assign-cefr.ts`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
