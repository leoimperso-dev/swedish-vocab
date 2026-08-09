// Imports agent-generated word records (missing common words), deduping against existing headwords.
// Records are { term, translation, wordType, forms? }.
// Usage: pnpm tsx scripts/import-missing.ts <dir-with-missing-words-*.json> [pair]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import { PAIRS, asPairId } from '../lib/courses'
import { headwordKey } from '../lib/morphology'
import type { Prisma, WordType } from '@prisma/client'

const WORD_TYPES = new Set(['VERB', 'NOUN_EN', 'NOUN_ETT', 'NOUN', 'ADJECTIVE', 'ADVERB', 'FUNCTION', 'PHRASE', 'OTHER'])
const IMPORT_SOURCE = 'OpenSubtitles_top3000'
const IMPORT_CATEGORY = 'DIVERS FRÉQUENTS'

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/import-missing.ts <dir> [pair]'); process.exit(1) }
  const pair = asPairId(process.argv[3])
  const lang = PAIRS[pair].term
  const normalizeKey = (raw: string) => headwordKey(raw, lang)

  const files = fs.readdirSync(dir).filter(f => /^missing-words-\d+-[ab]\.json$/.test(f)).sort()
  console.log(`Files: ${files.join(', ')}`)

  const existing = await db.word.findMany({ where: { pair }, select: { term: true } })
  const existingKeys = new Set(existing.map(w => normalizeKey(w.term)))

  const toInsert: Array<{ term: string; translation: string; wordType: WordType; forms?: Prisma.InputJsonValue }> = []
  let skippedExisting = 0
  let skippedInvalid = 0

  for (const file of files) {
    const records = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!Array.isArray(records)) { console.error(`${file}: not an array`); continue }
    for (const r of records) {
      if (!r || typeof r.term !== 'string' || typeof r.translation !== 'string' || !WORD_TYPES.has(r.wordType)) {
        skippedInvalid++
        continue
      }
      const key = normalizeKey(r.term)
      if (!key || existingKeys.has(key)) { skippedExisting++; continue }
      existingKeys.add(key)
      toInsert.push({
        term: r.term.trim(),
        translation: r.translation.trim(),
        wordType: r.wordType,
        forms: r.forms && typeof r.forms === 'object' ? (r.forms as Prisma.InputJsonValue) : undefined,
      })
    }
  }

  console.log(`New words: ${toInsert.length} (skipped: ${skippedExisting} already present, ${skippedInvalid} invalid)`)

  const result = await db.word.createMany({
    data: toInsert.map(w => ({ ...w, pair, source: IMPORT_SOURCE, category: IMPORT_CATEGORY })),
    skipDuplicates: true,
  })
  console.log(`Inserted: ${result.count}`)
  process.exit(0)
}
main()
