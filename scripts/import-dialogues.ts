// Imports agent-generated dialogues (dialogues-<pair>.json) into the Dialogue table.
// The pair is read from each filename, so one run covers every language.
// Usage: pnpm tsx scripts/import-dialogues.ts <dir-with-dialogues-json>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import { asPairId } from '../lib/courses'

const LEVELS = new Set(['beginner', 'intermediate', 'expert'])

interface Turn { speaker: 'them' | 'you'; text: string; translation: string }

function validTurns(turns: unknown): turns is Turn[] {
  if (!Array.isArray(turns) || turns.length < 2) return false
  // Strict alternation, but either side may open — some dialogues start with
  // the learner (the player then shows the cue before speaking anything)
  const first = turns[0]?.speaker
  if (first !== 'them' && first !== 'you') return false
  return turns.every((turn: Turn, i) =>
    turn?.text && turn?.translation &&
    turn.speaker === (i % 2 === 0 ? first : first === 'them' ? 'you' : 'them'))
}

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/import-dialogues.ts <dir>'); process.exit(1) }

  const files = fs.readdirSync(dir).filter(f => /^dialogues-.+\.json$/.test(f)).sort()
  const rows = []
  for (const file of files) {
    const pair = asPairId(file.replace(/^dialogues-|\.json$/g, ''))
    const records = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!Array.isArray(records)) { console.error(`${file}: not an array`); continue }
    let kept = 0
    for (const r of records) {
      if (!r?.slug || !r?.title || !r?.titleTranslated || !LEVELS.has(r.level) || !validTurns(r.turns)) {
        console.error(`  invalid record in ${file}: ${r?.slug ?? '(no slug)'}`)
        continue
      }
      rows.push({
        pair, slug: r.slug, title: r.title, titleTranslated: r.titleTranslated,
        level: r.level, turns: r.turns,
      })
      kept++
    }
    console.log(`${file} → ${pair}: ${kept} / ${records.length}`)
  }

  const result = await db.dialogue.createMany({ data: rows, skipDuplicates: true })
  console.log(`Inserted ${result.count} / ${rows.length} dialogues`)
  process.exit(0)
}
main()
