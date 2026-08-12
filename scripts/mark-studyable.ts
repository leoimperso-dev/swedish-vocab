// Recomputes Word.studyable — run after every seed.
//
// Curated lists (Swedish.txt, *_core_*.txt) are trusted wholesale; only
// degenerate rows are dropped. The bulk Wiktionary batches are judged entry by
// entry, because they carry three defects that are individually detectable:
//
//  1. Poisoned ranks. The subtitle corpus tokenises "don't" as "don" + "t", so
//     `don` (a real but literary verb) inherits rank 31 and would be served as
//     a top-50 word. Same for `haven`, `won`, `wo`, `ca`.
//  2. Definitions instead of translations. Wiktionary glosses like "D'accord,
//     soit, ça va, utilisé pour introduire un exemple" cannot be an answer.
//  3. Inflected forms treated as headwords ("talking", "years"), which duplicate
//     a word the curated lists already teach.
//
// Usage: pnpm tsx scripts/mark-studyable.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { lemmaCandidates } from '../lib/morphology'
import { pairOf, type Lang } from '../lib/courses'

const MARKER = /^(en|ett|att|to|de|het|el|la|los|las)\s+/
const norm = (s: string) => s.toLowerCase().replace(MARKER, '').trim()

// Fragments left by the corpus splitting contractions, plus subtitle fillers
// that rank high without being vocabulary. Only what the samples actually
// surfaced — this list is meant to stay short and auditable.
const BLOCKED: Partial<Record<Lang, Set<string>>> = {
  en: new Set([
    'don', 'won', 'haven', 'wo', 'ca', 'ai', 'sha', 'isn', 'aren', 'doesn', 'didn',
    'wasn', 'weren', 'couldn', 'shouldn', 'wouldn', 'hasn', 'hadn', 'mustn', 'needn',
    'uh', 'uhh', 'um', 'umm', 'hmm', 'hm', 'mm', 'mmm', 'mhm', 'huh', 'er', 'err',
    'ah', 'aah', 'ahh', 'ooh', 'ohh', 'eh', 'ugh', 'shh',
  ]),
  nl: new Set(['uh', 'uhm', 'eh', 'hm', 'hmm', 'ah', 'oh', 'mm']),
  es: new Set(['eh', 'ah', 'oh', 'uh', 'mmm', 'hm']),
  sv: new Set(['öh', 'eh', 'äh', 'hm', 'hmm', 'mm', 'öhm']),
}

// A gloss that reads like a dictionary entry rather than a translation
function isDefinition(gloss: string): boolean {
  return /[(;…]/.test(gloss)
    || gloss.length > 30
    || (gloss.match(/,/g)?.length ?? 0) > 2
    || /^(pluriel|participe|forme|variante|troisième|singulier|abréviation)/i.test(gloss)
}

function isDegenerate(term: string, translation: string): boolean {
  return norm(term) === translation.toLowerCase().trim()
}

async function main() {
  const words = await db.word.findMany({
    select: { id: true, pair: true, term: true, translation: true, source: true,
              frequencyRank: true, forms: true, studyable: true },
  })

  // Everything the curated lists already teach, headwords and stored forms alike
  const coveredByPair = new Map<string, Set<string>>()
  for (const w of words) {
    if (w.source?.endsWith('_wiki.txt')) continue
    const covered = coveredByPair.get(w.pair) ?? new Set<string>()
    covered.add(norm(w.term))
    if (w.forms && typeof w.forms === 'object') {
      for (const value of Object.values(w.forms as Record<string, unknown>)) {
        if (typeof value === 'string') for (const form of value.split(/[,/]/)) covered.add(norm(form))
      }
    }
    coveredByPair.set(w.pair, covered)
  }

  const reasons = { degenerate: 0, noRank: 0, blocked: 0, definition: 0, inflection: 0 }
  const keep: string[] = []
  const drop: string[] = []

  for (const word of words) {
    let studyable: boolean
    if (isDegenerate(word.term, word.translation)) {
      studyable = false
      reasons.degenerate++
    } else if (!word.source?.endsWith('_wiki.txt')) {
      studyable = true
    } else {
      const term = norm(word.term)
      const lang = pairOf(word.pair).term
      const covered = coveredByPair.get(word.pair) ?? new Set<string>()
      if (word.frequencyRank == null) { studyable = false; reasons.noRank++ }
      else if (BLOCKED[lang]?.has(term)) { studyable = false; reasons.blocked++ }
      else if (isDefinition(word.translation)) { studyable = false; reasons.definition++ }
      else if (covered.has(term) || lemmaCandidates(term, lang).some(c => c !== term && covered.has(c))) {
        studyable = false
        reasons.inflection++
      } else studyable = true
    }
    ;(studyable ? keep : drop).push(word.id)
  }

  console.log('Entrées wiki écartées :', reasons)

  // Two statements instead of 47k, chunked to stay under the parameter limit
  for (const [ids, value] of [[keep, true], [drop, false]] as const) {
    for (let i = 0; i < ids.length; i += 5000) {
      await db.word.updateMany({
        where: { id: { in: ids.slice(i, i + 5000) } },
        data: { studyable: value },
      })
    }
  }

  const rows = await db.$queryRawUnsafe<Array<{ pair: string; studyable: bigint; total: bigint }>>(
    `SELECT pair, count(*) FILTER (WHERE studyable) AS studyable, count(*) AS total
     FROM "Word" GROUP BY pair ORDER BY pair`)
  for (const r of rows) console.log(`  ${r.pair}: ${r.studyable} / ${r.total} exerçables`)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
