// Writes back the reviewed comparative/superlative of adjectives.
//
// Merges into Word.forms rather than replacing it — a Swedish adjective also
// carries `ett` and `plural`, which this pass does not touch. An entry reviewed
// as non-gradable ("mort", "enceinte", "premier") is left alone: an invented
// degree is worse than none.
//
// Usage: pnpm tsx scripts/import-adjective-forms.ts <dir> [--apply]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

interface Exported { i: number; id: string; t: string; g: string }
interface Reviewed { i: number; c: string | null; s: string | null }

async function main() {
  const dir = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!dir) {
    console.error('Usage: tsx scripts/import-adjective-forms.ts <dir> [--apply]')
    process.exit(1)
  }

  const files = fs.readdirSync(dir).filter(f => /^degres-.+\.json$/.test(f)).sort()
  if (files.length === 0) {
    console.error(`Aucun fichier degres-<pair>.json dans ${dir}`)
    process.exit(1)
  }

  let filled = 0, ungradable = 0, missing = 0
  const samples: string[] = []

  for (const file of files) {
    const pair = file.replace(/^degres-|\.json$/g, '')
    const source: Exported[] = JSON.parse(
      fs.readFileSync(path.join(dir, `adjectifs-${pair}.json`), 'utf-8'),
    )
    const reviewed: Reviewed[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    const byIndex = new Map(reviewed.map(r => [r.i, r]))

    let pairFilled = 0, pairUngradable = 0
    for (const entry of source) {
      const review = byIndex.get(entry.i)
      if (!review) { missing++; continue }
      const comparative = review.c?.trim()
      const superlative = review.s?.trim()
      if (!comparative || !superlative) { pairUngradable++; continue }

      pairFilled++
      if (samples.length < 12) samples.push(`${pair}  ${entry.t} → ${comparative}, ${superlative}`)

      if (apply) {
        const word = await db.word.findUnique({ where: { id: entry.id }, select: { forms: true } })
        const current = (word?.forms && typeof word.forms === 'object' ? word.forms : {}) as Record<string, string>
        await db.word.update({
          where: { id: entry.id },
          data: { forms: { ...current, comparative, superlative } },
        })
      }
    }
    console.log(`${pair}: ${pairFilled} adjectifs complétés, ${pairUngradable} sans degrés (laissés tels quels)`)
    filled += pairFilled
    ungradable += pairUngradable
  }

  if (missing > 0) console.error(`\n${missing} entrées sans révision — laissées telles quelles`)
  console.log(`\n${apply ? 'Appliqué' : 'Simulation'} — ${filled} complétés, ${ungradable} non gradables`)
  console.log('\nÉchantillon :')
  for (const s of samples) console.log('  ' + s)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
