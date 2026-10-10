// Strips example sentences unfit for a learning app from Word.examples.
//
// Tatoeba is a general-purpose corpus: alongside "Mummy, where's my hanky?" it
// carries "Mummy, I've got an erection." Both matched the headword `mummy`, and
// the cloze exercise served the second one. Sentences are the only content the
// app shows verbatim without a human ever reading it, so they get a filter.
//
// Usage: pnpm tsx scripts/filter-examples.ts [--apply]
//        without --apply, reports what would be removed and changes nothing
import 'dotenv/config'
import { db } from '../lib/db'
import { pairOf, type Lang } from '../lib/courses'

// Blocklists are per language, because the same spelling is innocent elsewhere:
// Spanish "hora" is an hour, Swedish "hora" is a slur; English "bite" is to
// bite, French "bite" is not. Matching is word for word, lowercased, WITHOUT
// stripping accents — folding turns Swedish "höra" (to hear) into "hora".
//
// Deliberately absent, having produced only false positives: "sexe" and
// "sexuel" (biology sentences), "baiser" (the noun is a kiss), "putain" and
// "bordel" (interjections, everywhere in a subtitle corpus).
const BLOCKED: Record<Lang, string[]> = {
  fr: [
    'érection', 'pénis', 'zizi', 'bite', 'vagin', 'couilles', 'testicules',
    'masturber', 'masturbation', 'orgasme', 'porno', 'préservatif', 'nichons',
    'baise', 'baisé', 'baisée', 'niquer', 'prostituée', 'pute', 'putes', 'salope',
    'nègre', 'pédé', 'youpin', 'viol', 'violée', 'violer', 'suicide', 'suicider',
  ],
  en: [
    'erection', 'penis', 'vagina', 'masturbate', 'masturbation', 'orgasm', 'porn',
    'porno', 'condom', 'boobs', 'tits', 'fuck', 'fucking', 'fucked', 'whore',
    'bitch', 'prostitute', 'brothel', 'nigger', 'faggot', 'rape', 'raped',
    'suicide',
  ],
  nl: [
    'erectie', 'penis', 'vagina', 'masturberen', 'orgasme', 'porno', 'condoom',
    'neuken', 'hoer', 'kut', 'verkrachten', 'verkrachting', 'zelfmoord',
  ],
  es: [
    'erección', 'pene', 'vagina', 'masturbarse', 'orgasmo', 'porno', 'condón',
    'tetas', 'follar', 'coño', 'chinga', 'jode', 'puta', 'prostituta', 'burdel',
    'violación', 'violar', 'suicidarse', 'suicidio',
  ],
  sv: [
    'erektion', 'penis', 'kuk', 'fitta', 'onanera', 'orgasm', 'porr', 'kondom',
    'knulla', 'hora', 'horan', 'våldtäkt', 'våldta', 'självmord',
  ],
  de: [
    'erektion', 'penis', 'vagina', 'masturbieren', 'orgasmus', 'porno', 'kondom',
    'titten', 'ficken', 'scheiße', 'hure', 'nutte', 'vergewaltigung', 'vergewaltigen',
    'selbstmord', 'suizid',
  ],
}

const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

interface Example { term?: string; translation?: string; blank?: string }

async function main() {
  const apply = process.argv.includes('--apply')
  const words = await db.word.findMany({
    select: { id: true, pair: true, term: true, examples: true },
  })

  let scanned = 0, removed = 0, touched = 0, emptied = 0
  const byPair = new Map<string, number>()
  const samples: string[] = []

  for (const word of words) {
    const examples = (Array.isArray(word.examples) ? word.examples : []) as Example[]
    if (examples.length === 0) continue

    const { term: termLang, translation: translationLang } = pairOf(word.pair)
    const termBlocked = new Set(BLOCKED[termLang])
    const translationBlocked = new Set(BLOCKED[translationLang])
    // A headword that is itself the sensitive term is taught anyway, so
    // stripping its sentences only leaves it without examples
    if (tokens(word.term).some(w => termBlocked.has(w))) continue

    scanned += examples.length
    const kept = examples.filter(e => {
      const hit = tokens(e.term ?? '').find(w => termBlocked.has(w))
        ?? tokens(e.translation ?? '').find(w => translationBlocked.has(w))
      if (!hit) return true
      removed++
      byPair.set(word.pair, (byPair.get(word.pair) ?? 0) + 1)
      if (samples.length < 15) samples.push(`${word.pair}  [${hit}]  ${word.term}: ${e.term}`)
      return false
    })
    if (kept.length === examples.length) continue

    touched++
    if (kept.length === 0) emptied++
    if (apply) {
      await db.word.update({
        where: { id: word.id },
        data: { examples: kept as unknown as object },
      })
    }
  }

  console.log(`${apply ? 'Appliqué' : 'Simulation'} — phrases scannées : ${scanned}`)
  console.log(`  retirées : ${removed}, sur ${touched} mots (${emptied} se retrouvent sans exemple)`)
  for (const [pair, n] of [...byPair].sort()) console.log(`    ${pair}: ${n}`)
  console.log('\nÉchantillon retiré (entre crochets, le mot déclencheur) :')
  for (const s of samples) console.log('  ' + s.slice(0, 110))
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
