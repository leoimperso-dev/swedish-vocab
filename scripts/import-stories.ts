// Imports agent-generated stories (stories-*.json) into the Story table.
// Usage: pnpm tsx scripts/import-stories.ts <dir-with-stories-json>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

const LEVELS = new Set(['beginner', 'intermediate', 'expert', 'dialogue'])

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/import-stories.ts <dir>'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^stories-.*\.json$/.test(f)).sort()
  console.log(`Files: ${files.join(', ')}`)

  const stories = []
  for (const file of files) {
    const records = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!Array.isArray(records)) { console.error(`${file}: not an array`); continue }
    for (const r of records) {
      if (!r?.slug || !r?.title || !r?.titleFrench || !r?.body || !LEVELS.has(r.level)) {
        console.error(`invalid record in ${file}:`, r?.slug)
        continue
      }
      stories.push({
        slug: r.slug,
        title: r.title,
        titleFrench: r.titleFrench,
        level: r.level,
        body: r.body,
        wordCount: r.body.split(/\s+/).filter(Boolean).length,
      })
    }
  }

  const result = await db.story.createMany({ data: stories, skipDuplicates: true })
  console.log(`Inserted ${result.count} / ${stories.length} stories`)
  process.exit(0)
}
main()
