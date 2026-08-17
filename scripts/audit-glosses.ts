// Counts the glosses that read as a dictionary article rather than a translation.
//
// The bulk import merged several senses per entry, so some translations repeat
// themselves ("solitude, isolement, solitude"), run to a definition ("qualité
// de ce qui est beau") or list five senses where a learner needs one.
//
// Usage: pnpm tsx scripts/audit-glosses.ts [--list]
import 'dotenv/config'
import { db } from '../lib/db'
import { PAIRS, type PairId } from '../lib/courses'

const MAX_SENSES = 3
const MAX_SENSE_LENGTH = 34
const DEFINITION_WORDS = /\b(qui|dont|lorsqu|celui|celle)\b/

type Flaw = 'doublon' | 'définition' | 'trop de sens'

function flawsOf(translation: string): Flaw[] {
  const senses = translation.split(',').map(s => s.trim()).filter(Boolean)
  const flaws: Flaw[] = []
  const seen = new Set(senses.map(s => s.toLowerCase()))
  if (seen.size < senses.length) flaws.push('doublon')
  if (senses.some(s => s.length > MAX_SENSE_LENGTH || DEFINITION_WORDS.test(s.toLowerCase()))) {
    flaws.push('définition')
  }
  if (senses.length > MAX_SENSES) flaws.push('trop de sens')
  return flaws
}

async function main() {
  const list = process.argv.includes('--list')
  for (const pair of Object.keys(PAIRS) as PairId[]) {
    const words = await db.word.findMany({
      where: { pair, studyable: true },
      select: { term: true, translation: true, frequencyRank: true, source: true },
      orderBy: { frequencyRank: { sort: 'asc', nulls: 'last' } },
    })
    const flagged = words
      .map(w => ({ ...w, flaws: flawsOf(w.translation) }))
      .filter(w => w.flaws.length > 0)
    const counts = new Map<Flaw, number>()
    for (const w of flagged) for (const f of w.flaws) counts.set(f, (counts.get(f) ?? 0) + 1)
    const detail = [...counts].map(([f, n]) => `${f} ${n}`).join(', ')
    const share = ((flagged.length / words.length) * 100).toFixed(1)
    console.log(`${pair}: ${flagged.length}/${words.length} (${share} %) — ${detail}`)
    if (list) {
      for (const w of flagged.slice(0, 20)) {
        console.log(`   #${w.frequencyRank ?? '-'} ${w.term}: ${w.translation}  [${w.flaws.join('+')}]`)
      }
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
