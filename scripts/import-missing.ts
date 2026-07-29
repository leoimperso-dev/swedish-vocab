// Imports agent-generated word records (missing common words), deduping against existing headwords.
// Usage: pnpm tsx scripts/import-missing.ts <dir-with-missing-words-*.json>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import type { Prisma, WordType } from '@prisma/client'

const WORD_TYPES = new Set(['VERB', 'NOUN_EN', 'NOUN_ETT', 'ADJECTIVE', 'ADVERB', 'FUNCTION', 'PHRASE', 'OTHER'])
const IMPORT_SOURCE = 'OpenSubtitles_top3000'
const IMPORT_CATEGORY = 'DIVERS FRÉQUENTS'

function normalizeKey(swedish: string): string {
  return swedish.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
    .replace(/^(en|ett|att)\s+/, '')
}

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/import-missing.ts <dir>'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^missing-words-\d+-[ab]\.json$/.test(f)).sort()
  console.log(`Files: ${files.join(', ')}`)

  const existing = await db.word.findMany({ select: { swedish: true } })
  const existingKeys = new Set(existing.map(w => normalizeKey(w.swedish)))

  const toInsert: Array<{ swedish: string; french: string; wordType: WordType; forms?: Prisma.InputJsonValue }> = []
  let skippedExisting = 0
  let skippedInvalid = 0

  for (const file of files) {
    const records = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!Array.isArray(records)) { console.error(`${file}: not an array`); continue }
    for (const r of records) {
      if (!r || typeof r.swedish !== 'string' || typeof r.french !== 'string' || !WORD_TYPES.has(r.wordType)) {
        skippedInvalid++
        continue
      }
      const key = normalizeKey(r.swedish)
      if (!key || existingKeys.has(key)) { skippedExisting++; continue }
      existingKeys.add(key)
      toInsert.push({
        swedish: r.swedish.trim(),
        french: r.french.trim(),
        wordType: r.wordType,
        forms: r.forms && typeof r.forms === 'object' ? (r.forms as Prisma.InputJsonValue) : undefined,
      })
    }
  }

  console.log(`New words: ${toInsert.length} (skipped: ${skippedExisting} already present, ${skippedInvalid} invalid)`)

  const result = await db.word.createMany({
    data: toInsert.map(w => ({ ...w, source: IMPORT_SOURCE, category: IMPORT_CATEGORY })),
    skipDuplicates: true,
  })
  console.log(`Inserted: ${result.count}`)
  process.exit(0)
}
main()
