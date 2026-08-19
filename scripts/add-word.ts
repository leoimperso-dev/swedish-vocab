// Adds a word to a pair's dictionary, one call or a whole JSON file.
//
// The curated lists are seeded in bulk from .txt files, which is the wrong tool
// for a single entry met while reading: a word absent from the dictionary is
// not just a gap, it is a wrong answer. Tapping "greenen" in a golf text gave
// nothing, and "hålkanten" fell back to the compound's second half.
//
// Usage:
//   pnpm tsx scripts/add-word.ts <term> <translation> [pair] [wordType] [category]
//   pnpm tsx scripts/add-word.ts --file words.json [pair]
//
// JSON: [{ "term": "en green", "translation": "un green", "wordType": "NOUN_EN",
//          "category": "GOLF", "forms": { "plural": "greener" } }]
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'
import { asPairId } from '../lib/courses'
import { cefrForRank } from '../lib/cefr'

const TYPES = new Set(['VERB', 'NOUN_EN', 'NOUN_ETT', 'NOUN', 'ADJECTIVE', 'ADVERB', 'FUNCTION', 'PHRASE', 'OTHER'])

interface Entry {
  term: string
  translation: string
  wordType?: string
  category?: string
  forms?: Record<string, string>
}

/** Guessed from the article the term carries, so a noun rarely needs the argument. */
function inferType(term: string): string {
  const lower = term.toLowerCase()
  if (lower.startsWith('en ')) return 'NOUN_EN'
  if (lower.startsWith('ett ')) return 'NOUN_ETT'
  if (lower.startsWith('att ')) return 'VERB'
  return 'OTHER'
}

async function addOne(entry: Entry, pair: string): Promise<'added' | 'exists'> {
  const wordType = entry.wordType && TYPES.has(entry.wordType) ? entry.wordType : inferType(entry.term)
  const existing = await db.word.findFirst({
    where: { pair, term: { equals: entry.term, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) return 'exists'

  await db.word.create({
    data: {
      pair,
      term: entry.term,
      translation: entry.translation,
      wordType: wordType as never,
      category: entry.category ?? 'AJOUTS MANUELS',
      source: 'manual',
      // No corpus rank until apply-frequency runs again; an unranked word is
      // treated as C2, which keeps it out of a beginner's new-word draw
      cefr: cefrForRank(null),
      studyable: true,
      ...(entry.forms ? { forms: entry.forms as never } : {}),
    },
  })
  return 'added'
}

async function main() {
  const args = process.argv.slice(2)
  let entries: Entry[]
  let pair: string

  if (args[0] === '--file') {
    const parsed = JSON.parse(fs.readFileSync(args[1], 'utf-8'))
    if (!Array.isArray(parsed)) { console.error('le fichier doit contenir un tableau'); process.exit(1) }
    entries = parsed
    pair = asPairId(args[2])
  } else {
    const [term, translation, pairArg, wordType, category] = args
    if (!term || !translation) {
      console.error('usage: pnpm tsx scripts/add-word.ts <term> <translation> [pair] [wordType] [category]')
      process.exit(1)
    }
    entries = [{ term, translation, wordType, category }]
    pair = asPairId(pairArg)
  }

  let added = 0
  for (const entry of entries) {
    if (!entry?.term || !entry?.translation) { console.error('entrée invalide :', entry); continue }
    const result = await addOne(entry, pair)
    console.log(`${result === 'added' ? '+' : '='} ${entry.term} — ${entry.translation}`)
    if (result === 'added') added++
  }
  console.log(`\n${added} ajouté(s) sur ${entries.length} dans ${pair}`)
  console.log('Pensez à relancer apply-frequency (rangs) et assign-cefr après un lot important.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
