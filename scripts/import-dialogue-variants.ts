// Attaches accepted rephrasings to the "you" turns of each dialogue.
// A learner can say the same thing many ways; string comparison alone marks
// every one of them wrong, so each turn carries a list of alternatives.
// Usage: pnpm tsx scripts/import-dialogue-variants.ts <dir-with-accepts-json>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

interface Turn { speaker: 'them' | 'you'; text: string; translation: string; accepts?: string[] }
interface Entry { slug: string; i: number; accepts: string[] }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

// A bare noun answering a full sentence ("Jag kommer från Skottland" → "Skottland")
// is what a native would say, but it stops training sentence production
function tooShort(variant: string, canonical: string): boolean {
  const expected = wordCount(canonical)
  return expected >= 3 && wordCount(variant) < Math.ceil(expected / 2)
}

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/import-dialogue-variants.ts <dir>'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^accepts-.+\.json$/.test(f)).sort()
  const bySlug = new Map<string, Map<number, string[]>>()
  for (const file of files) {
    const entries: Entry[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    for (const e of entries) {
      if (!e?.slug || typeof e.i !== 'number' || !Array.isArray(e.accepts)) continue
      const turns = bySlug.get(e.slug) ?? new Map<number, string[]>()
      turns.set(e.i, e.accepts.filter(a => typeof a === 'string' && a.trim()))
      bySlug.set(e.slug, turns)
    }
    console.log(`${file}: ${entries.length} répliques`)
  }

  let updated = 0, attached = 0, skipped = 0
  for (const [slug, turnAccepts] of bySlug) {
    const dialogue = await db.dialogue.findUnique({ where: { slug } })
    if (!dialogue) { console.error(`  dialogue absent: ${slug}`); skipped++; continue }
    const turns = dialogue.turns as unknown as Turn[]
    let touched = false
    for (const [i, accepts] of turnAccepts) {
      const turn = turns[i]
      // A drifted index would silently attach answers to the wrong line
      if (!turn || turn.speaker !== 'you') { console.error(`  ${slug}[${i}] n'est pas une réplique « you »`); skipped++; continue }
      const canonical = fold(turn.text)
      const clean = [...new Set(accepts.map(a => a.trim()))]
        .filter(a => fold(a) !== canonical && !tooShort(a, turn.text))
      if (clean.length === 0) continue
      turn.accepts = clean
      attached += clean.length
      touched = true
    }
    if (!touched) continue
    await db.dialogue.update({ where: { slug }, data: { turns: turns as unknown as object } })
    updated++
  }

  console.log(`\n${updated} dialogues mis à jour, ${attached} variantes attachées, ${skipped} ignorées`)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
