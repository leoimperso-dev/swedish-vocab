// Applies a reviewed translation pass over the bulk Wiktionary entries.
//
// The imported glosses often kept a marginal sense: `politics → enjeux`,
// `bay → crier, aboyer`, `mutton → sourd`. Since the app asks in both
// directions, a one-way gloss makes an unanswerable card. This writes back the
// primary-sense translations and drops the entries not worth teaching.
//
// Usage: pnpm tsx scripts/import-wiki-glosses.ts <dir> [--apply]
//        without --apply, reports what would change and writes nothing
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

interface Exported { i: number; id: string; t: string; g: string }
interface Reviewed { i: number; fr: string; keep: boolean }

async function main() {
  const dir = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!dir) { console.error('Usage: tsx scripts/import-wiki-glosses.ts <dir> [--apply]'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^revu-.+\.json$/.test(f)).sort()
  let changed = 0, dropped = 0, missing = 0
  const samples: string[] = []

  for (const file of files) {
    const pair = file.replace(/^revu-|\.json$/g, '')
    const source: Exported[] = JSON.parse(fs.readFileSync(path.join(dir, `gloses-${pair}.json`), 'utf-8'))
    const reviewed: Reviewed[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    const byIndex = new Map(reviewed.map(r => [r.i, r]))

    let pairChanged = 0, pairDropped = 0
    for (const entry of source) {
      const review = byIndex.get(entry.i)
      // A missing review would silently leave the bad gloss in place
      if (!review) { missing++; continue }
      const translation = review.fr.trim()
      const needsGloss = translation && translation !== entry.g
      const needsDrop = review.keep === false
      if (!needsGloss && !needsDrop) continue

      if (needsGloss) {
        pairChanged++
        if (samples.length < 12 && !needsDrop) samples.push(`${pair}  ${entry.t}: ${entry.g}  →  ${translation}`)
      }
      if (needsDrop) pairDropped++

      if (apply) {
        await db.word.update({
          where: { id: entry.id },
          data: {
            ...(needsGloss ? { translation } : {}),
            ...(needsDrop ? { studyable: false } : {}),
          },
        })
      }
    }
    console.log(`${pair}: ${pairChanged} gloses réécrites, ${pairDropped} entrées retirées des exercices`)
    changed += pairChanged
    dropped += pairDropped
  }

  if (missing > 0) console.error(`\n${missing} entrées sans révision — laissées telles quelles`)
  console.log(`\n${apply ? 'Appliqué' : 'Simulation'} — ${changed} réécritures, ${dropped} retraits`)
  console.log('\nÉchantillon :')
  for (const s of samples) console.log('  ' + s)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
