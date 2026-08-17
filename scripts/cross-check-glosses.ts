// Cross-checks every studyable gloss against an independent bilingual dictionary.
//
// A wrong translation that is well formed is invisible to any heuristic: only a
// second opinion catches it. WikDict (CC BY-SA, built from Wiktionary/DBnary)
// gives one for each of our pairs. It is NOT a gold standard — "bueno → alló"
// is in there — so a disagreement is a *review request*, never a correction to
// apply blind.
//
// Download once (dumps are ~8-23 MB each):
//   https://download.wikdict.com/dictionaries/sqlite/<version>/<pair>.sqlite3
//   → Desktop\pro\wikdict\<pair>.sqlite3
//
// Usage: pnpm tsx scripts/cross-check-glosses.ts <wikdict-dir> [pair...] [--export <dir>]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'node:module'
import { db } from '../lib/db'
import { glossSenses } from '../lib/gloss'
import { headwordKey } from '../lib/morphology'
import { PAIRS, pairOf, type PairId } from '../lib/courses'

// node:sqlite ships with Node 22+ but is not in the installed @types/node yet,
// so the handful of methods used here are typed by hand
interface SqliteDb {
  prepare(sql: string): { get(...params: unknown[]): unknown }
  close(): void
}
const { DatabaseSync } = createRequire(process.argv[1])('node:sqlite') as {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDb
}

interface Suspect {
  i: number
  id: string
  t: string
  g: string // our gloss
  w: string // what the reference dictionary says
  r: number | null
}

/**
 * Senses to compare on. `glossSenses` drops function words, which empties both
 * sides of an entry like "un" and makes it look like a disagreement — so fall
 * back to the literal senses when nothing content-bearing is left.
 */
function sensesOf(gloss: string): string[] {
  const senses = glossSenses(gloss)
  if (senses.length > 0) return senses
  return gloss
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;/]/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/** WikDict separates senses with " | ", we use commas. */
function referenceSenses(transList: string): string[] {
  return sensesOf(transList.split('|').join(','))
}

// Grammar words are translated by role, not by equivalence: "te → trop" and
// "te → en, à" are both right, and comparing them only produces noise. The
// errors worth hunting are in the content words.
const CONTENT_TYPES = ['NOUN', 'NOUN_EN', 'NOUN_ETT', 'VERB', 'ADJECTIVE', 'ADVERB'] as const

function openPair(dir: string, pair: PairId): SqliteDb | null {
  const file = path.join(dir, `${pair}.sqlite3`)
  if (!fs.existsSync(file)) {
    console.error(`${pair}: ${file} absent — passé`)
    return null
  }
  return new DatabaseSync(file, { readOnly: true })
}

async function main() {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Usage: tsx scripts/cross-check-glosses.ts <wikdict-dir> [pair...] [--export <dir>]')
    process.exit(1)
  }
  const exportAt = process.argv.indexOf('--export')
  const exportDir = exportAt > 0 ? process.argv[exportAt + 1] : null
  const asked = process.argv.slice(3).filter(a => !a.startsWith('--') && a !== exportDir) as PairId[]
  const targets = asked.length > 0 ? asked : (Object.keys(PAIRS) as PairId[])
  if (exportDir) fs.mkdirSync(exportDir, { recursive: true })

  for (const pair of targets) {
    const sqlite = openPair(dir, pair)
    if (!sqlite) continue
    const lookup = sqlite.prepare('SELECT trans_list FROM simple_translation WHERE written_rep = ?')

    const words = await db.word.findMany({
      where: { pair, studyable: true, wordType: { in: [...CONTENT_TYPES] } },
      select: { id: true, term: true, translation: true, frequencyRank: true },
      orderBy: { frequencyRank: { sort: 'asc', nulls: 'last' } },
    })

    const termLang = pairOf(pair).term
    let checked = 0, agreed = 0
    const suspects: Suspect[] = []

    for (const word of words) {
      const key = headwordKey(word.term, termLang)
      const row = lookup.get(key) as { trans_list?: string } | undefined
      // Not in the reference dictionary: nothing to conclude, not a suspect
      if (!row?.trans_list) continue
      checked++
      const ours = new Set(sensesOf(word.translation))
      const theirs = referenceSenses(row.trans_list)
      if (theirs.some(sense => ours.has(sense))) { agreed++; continue }
      suspects.push({
        i: suspects.length,
        id: word.id,
        t: word.term,
        g: word.translation,
        w: row.trans_list.split('|').map(s => s.trim()).join(', '),
        r: word.frequencyRank,
      })
    }
    sqlite.close()

    const rate = checked > 0 ? ((agreed / checked) * 100).toFixed(1) : '—'
    console.log(
      `${pair}: ${checked}/${words.length} mots présents dans la référence, ` +
      `${agreed} d'accord (${rate} %), ${suspects.length} à vérifier`,
    )
    for (const s of suspects.slice(0, 10)) {
      console.log(`   #${s.r ?? '-'} ${s.t}: « ${s.g} »  ≠  « ${s.w} »`)
    }

    if (exportDir) {
      const file = path.join(exportDir, `suspects-${pair}.json`)
      fs.writeFileSync(file, JSON.stringify(suspects), 'utf-8')
      console.log(`   → ${file}`)
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
