// Applies agent-generated enrichment (translations/context/usage) to Word.details.
// Usage: pnpm tsx scripts/apply-enrichment.ts <dir-with-enrich-output-*.json>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

interface EnrichRecord {
  id: string
  translations: string[]
  context?: string
  usage?: Array<{ sv: string; fr: string }>
}

function validate(r: unknown): EnrichRecord | null {
  if (!r || typeof r !== 'object') return null
  const rec = r as EnrichRecord
  if (typeof rec.id !== 'string') return null
  if (!Array.isArray(rec.translations) || rec.translations.some(t => typeof t !== 'string')) return null
  if (rec.translations.length === 0) return null
  const details: EnrichRecord = { id: rec.id, translations: rec.translations }
  if (typeof rec.context === 'string' && rec.context.trim()) details.context = rec.context.trim()
  if (Array.isArray(rec.usage)) {
    const usage = rec.usage.filter(u => u && typeof u.sv === 'string' && typeof u.fr === 'string')
    if (usage.length > 0) details.usage = usage
  }
  return details
}

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/apply-enrichment.ts <dir>'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^enrich-output-.*\.json$/.test(f)).sort()
  console.log(`Files: ${files.length}`)

  const records: EnrichRecord[] = []
  let invalid = 0
  for (const file of files) {
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    } catch (e) {
      console.error(`${file}: JSON parse error — skipped`)
      continue
    }
    if (!Array.isArray(parsed)) { console.error(`${file}: not an array`); continue }
    for (const r of parsed) {
      const rec = validate(r)
      if (rec) records.push(rec)
      else invalid++
    }
  }
  console.log(`Valid records: ${records.length} (invalid: ${invalid})`)

  const CHUNK = 200
  let updated = 0
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const values: string[] = []
    const params: string[] = []
    chunk.forEach((r, j) => {
      values.push(`($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`)
      const { id, ...details } = r
      params.push(id, JSON.stringify(details))
    })
    const count = await db.$executeRawUnsafe(
      `UPDATE "Word" AS w SET "details" = v.details FROM (VALUES ${values.join(',')}) AS v(id, details) WHERE w.id = v.id`,
      ...params
    )
    updated += count
    console.log(`Updated ${updated}`)
  }
  console.log(`Done: ${updated} words enriched`)
  process.exit(0)
}
main()
