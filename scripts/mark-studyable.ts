// Recomputes Word.studyable — run after every seed.
// See scripts/2026-08-12-studyable.sql for why entries are excluded.
// Usage: pnpm tsx scripts/mark-studyable.ts
import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const updated = await db.$executeRawUnsafe(`
    UPDATE "Word" SET "studyable" = NOT (
      source LIKE '%\\_wiki.txt'
      OR lower(regexp_replace(term, '^(en|ett|att|to|de|het|el|la|los|las) ', '')) = lower(translation)
    )`)
  console.log(`Rows evaluated: ${updated}`)

  const rows = await db.$queryRawUnsafe<Array<{ pair: string; studyable: bigint; total: bigint }>>(
    `SELECT pair, count(*) FILTER (WHERE studyable) AS studyable, count(*) AS total
     FROM "Word" GROUP BY pair ORDER BY pair`)
  for (const r of rows) console.log(`  ${r.pair}: ${r.studyable} / ${r.total} exerçables`)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
