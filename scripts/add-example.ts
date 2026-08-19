// Adds a hand-picked example sentence to a word.
//
// The generated examples come from Tatoeba, which is thin on rarer words and
// leaves many sentences untranslated. A sentence met in the wild, with its
// translation, is often better than anything the corpus offers — this is how it
// gets in.
//
// Manual examples are marked `manual: true` and kept first. build-examples.ts
// rewrites the whole array for a word, so without that flag a rebuild would
// silently delete them.
//
// Usage:
//   pnpm tsx scripts/add-example.ts <term> "<sentence>" "<translation>" [pair]
import 'dotenv/config'
import { db } from '../lib/db'
import { DEFAULT_PAIR } from '../lib/courses'

interface Example {
  term: string
  translation?: string
  blank: string
  manual?: boolean
}

/**
 * The surface form to hide in a cloze: the headword as it appears in the
 * sentence. Without it the sentence cannot serve as an exercise, only as
 * reading — and a headword absent from its own example is a mistake worth
 * refusing rather than storing.
 */
function findBlank(sentence: string, term: string): string | null {
  // Headwords carry their article ("en hänsyn", "het huis"); the sentence does not
  const words = term.trim().toLowerCase().split(/\s+/)
  const head = words[words.length - 1]
  const match = sentence.match(new RegExp(`\\b${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i'))
  return match ? match[0] : null
}

async function main() {
  const [term, sentence, translation, pair = DEFAULT_PAIR] = process.argv.slice(2)
  if (!term || !sentence || !translation) {
    console.error('usage: pnpm tsx scripts/add-example.ts <term> "<phrase>" "<traduction>" [pair]')
    process.exit(1)
  }

  const word = await db.word.findFirst({
    where: { pair, term: { equals: term, mode: 'insensitive' } },
  })
  if (!word) {
    // A headword is stored with its article; accept either spelling
    const loose = await db.word.findMany({
      where: { pair, term: { contains: term, mode: 'insensitive' } },
      select: { term: true },
      take: 10,
    })
    console.error(`"${term}" introuvable dans ${pair}.` + (loose.length ? ` Proche : ${loose.map(w => `"${w.term}"`).join(', ')}` : ''))
    process.exit(1)
  }

  const blank = findBlank(sentence, word.term)
  if (!blank) {
    console.error(`La phrase ne contient pas "${word.term}" — un exemple doit contenir le mot qu'il illustre.`)
    process.exit(1)
  }

  const existing = (Array.isArray(word.examples) ? word.examples : []) as unknown as Example[]
  if (existing.some(e => e.term === sentence)) {
    console.log('Cette phrase est déjà là, rien à faire.')
    process.exit(0)
  }

  const examples: Example[] = [{ term: sentence, translation, blank, manual: true }, ...existing]
  await db.word.update({ where: { id: word.id }, data: { examples: examples as never } })

  console.log(`${word.term} (${pair}) — ${examples.length} exemple(s), le nouveau en tête :`)
  console.log(`  [${sentence.split(/\s+/).length} mots, trou : "${blank}"] ${sentence}`)
  console.log(`  -> ${translation}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
