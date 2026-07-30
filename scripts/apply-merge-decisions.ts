// Applies agent merge decisions on cross-type duplicates.
// Input: JSON array of { key, action: "MERGE"|"KEEP_BOTH", keep?, delete?: string[] }
// Usage: pnpm tsx scripts/apply-merge-decisions.ts <decisions.json>
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('Usage: tsx scripts/apply-merge-decisions.ts <decisions.json>'); process.exit(1) }
  const decisions = JSON.parse(fs.readFileSync(file, 'utf-8'))
  if (!Array.isArray(decisions)) { console.error('not an array'); process.exit(1) }

  let merged = 0
  let keptBoth = 0
  for (const d of decisions) {
    if (d.action === 'KEEP_BOTH') { keptBoth++; continue }
    if (d.action !== 'MERGE' || typeof d.keep !== 'string' || !Array.isArray(d.delete)) continue
    const keep = await db.word.findUnique({ where: { id: d.keep }, select: { id: true } })
    if (!keep) { console.error(`keep id not found for ${d.key}`); continue }
    for (const delId of d.delete) {
      if (delId === d.keep) continue
      const dupProgress = await db.userWord.findMany({ where: { wordId: delId } })
      for (const p of dupProgress) {
        const exists = await db.userWord.findUnique({
          where: { userId_wordId_direction: { userId: p.userId, wordId: d.keep, direction: p.direction } },
        })
        if (exists) await db.userWord.delete({ where: { id: p.id } })
        else await db.userWord.update({ where: { id: p.id }, data: { wordId: d.keep } })
      }
      const dupFavs = await db.favorite.findMany({ where: { wordId: delId } })
      for (const f of dupFavs) {
        const exists = await db.favorite.findUnique({
          where: { userId_wordId: { userId: f.userId, wordId: d.keep } },
        })
        if (exists) await db.favorite.delete({ where: { id: f.id } })
        else await db.favorite.update({ where: { id: f.id }, data: { wordId: d.keep } })
      }
      await db.word.delete({ where: { id: delId } }).then(() => { merged++ }).catch(e => console.error(`delete ${delId}:`, e.message))
    }
  }
  console.log(`Merged: ${merged} rows deleted | kept both: ${keptBoth}`)
  console.log('Remaining words:', await db.word.count())
  process.exit(0)
}
main()
