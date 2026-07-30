// Imports agent-generated grammar lessons (lessons-*.json) into GrammarLesson.
// Usage: pnpm tsx scripts/import-grammar.ts <dir>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/import-grammar.ts <dir>'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^lessons-.*\.json$/.test(f)).sort()
  console.log(`Files: ${files.join(', ')}`)

  const lessons = []
  for (const file of files) {
    let records: unknown
    try {
      records = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    } catch {
      console.error(`${file}: JSON parse error — skipped`)
      continue
    }
    if (!Array.isArray(records)) { console.error(`${file}: not an array`); continue }
    for (const r of records) {
      if (!r?.slug || !r?.title || !r?.category || typeof r.order !== 'number' || !r?.body) {
        console.error(`invalid record in ${file}:`, r?.slug)
        continue
      }
      lessons.push({ slug: r.slug, title: r.title, category: r.category, order: r.order, body: r.body })
    }
  }

  const result = await db.grammarLesson.createMany({ data: lessons, skipDuplicates: true })
  console.log(`Inserted ${result.count} / ${lessons.length} lessons`)
  process.exit(0)
}
main()
