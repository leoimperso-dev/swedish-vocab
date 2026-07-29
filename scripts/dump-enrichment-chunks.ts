// Dumps all words into chunk files for parallel enrichment agents (most frequent first).
// Usage: pnpm tsx scripts/dump-enrichment-chunks.ts <output-dir> [chunkSize]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

async function main() {
  const dir = process.argv[2]
  const chunkSize = Number(process.argv[3] ?? 200)
  if (!dir) { console.error('Usage: tsx scripts/dump-enrichment-chunks.ts <dir> [chunkSize]'); process.exit(1) }

  const words = await db.word.findMany({
    select: { id: true, swedish: true, french: true, wordType: true, forms: true },
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })

  let count = 0
  for (let i = 0; i < words.length; i += chunkSize) {
    count++
    const file = path.join(dir, `enrich-input-${String(count).padStart(2, '0')}.json`)
    fs.writeFileSync(file, JSON.stringify(words.slice(i, i + chunkSize), null, 1))
  }
  console.log(`${words.length} words → ${count} chunks of ${chunkSize} in ${dir}`)
  process.exit(0)
}
main()
