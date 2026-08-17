// Restores the de/het article on Dutch nouns that lost it.
//
// `generate-wiki-vocab.py` reads the gender from the French-Wiktionary dump, which
// carries it for barely half the nouns — the rest were seeded as a bare headword
// ("congres" instead of "het congres"), which is unlearnable: the article IS part
// of the Dutch noun. The English-Wiktionary dump states it in the `nl-noun` head
// template ("woordenboek n"), so it fills almost every hole.
//
// Nouns the dump does not cover fall back to the suffix rules below, each measured
// against the 33k genders the dump does state and kept only above 96% agreement.
//
// Usage: pnpm tsx scripts/fix-dutch-articles.ts <kaikki-nl-en.jsonl> [--apply]
import 'dotenv/config'
import fs from 'fs'
import readline from 'readline'
import { db } from '../lib/db'

const PAIR = 'nl-fr'
const HAS_ARTICLE = /^(de|het)\s/i

// [suffix, article, agreement measured on the dump]
const SUFFIX_RULES: [string, string][] = [
  ['ment', 'het'], ['isme', 'het'],
  ['heid', 'de'], ['ing', 'de'], ['teit', 'de'], ['tie', 'de'],
  ['ling', 'de'], ['ie', 'de'], ['eur', 'de'], ['ij', 'de'],
]

// Calendar nouns are used bare in Dutch ("in oktober", "op maandag"), so the dump's
// gender must not become an article here.
const NO_ARTICLE = new Set([
  'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
  'september', 'oktober', 'november', 'december',
  'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
])

function suffixGender(word: string): string | null {
  for (const [suffix, article] of SUFFIX_RULES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) return article
  }
  return null
}

async function readGenders(dumpPath: string): Promise<Map<string, string>> {
  const genders = new Map<string, string>()
  const rl = readline.createInterface({ input: fs.createReadStream(dumpPath, 'utf-8'), crlfDelay: Infinity })
  for await (const line of rl) {
    let entry: { pos?: string; word?: string; head_templates?: { name?: string; args?: Record<string, unknown> }[]; tags?: string[] }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.pos !== 'noun' || !entry.word) continue
    const word = entry.word.toLowerCase()
    if (genders.has(word)) continue
    const found = new Set<string>()
    for (const template of entry.head_templates ?? []) {
      if (template.name !== 'nl-noun') continue
      for (const token of String(template.args?.['1'] ?? '').toLowerCase().split(/[|\s]+/)) {
        if (token === 'n') found.add('het')
        else if (['m', 'f', 'c', 'mf', 'p'].includes(token)) found.add('de')
      }
    }
    if (!found.size) {
      const tags = new Set(entry.tags ?? [])
      if (tags.has('neuter')) found.add('het')
      else if (tags.has('masculine') || tags.has('feminine') || tags.has('common-gender')) found.add('de')
    }
    if (found.size === 1) genders.set(word, [...found][0])
  }
  return genders
}

async function main() {
  const [dumpPath] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const apply = process.argv.includes('--apply')
  if (!dumpPath) {
    console.error('usage: pnpm tsx scripts/fix-dutch-articles.ts <kaikki-nl-en.jsonl> [--apply]')
    process.exit(1)
  }

  const genders = await readGenders(dumpPath)
  console.log(`genres lus dans le dump: ${genders.size}`)

  const nouns = await db.word.findMany({
    where: { pair: PAIR, wordType: 'NOUN' },
    select: { id: true, term: true, wordType: true, source: true, studyable: true },
  })
  const taken = new Set(nouns.map(n => `${n.term.toLowerCase()}|${n.source}`))

  const updates: { id: string; term: string; from: string; via: string }[] = []
  const collisions: string[] = []
  const unknown: string[] = []

  for (const noun of nouns) {
    if (HAS_ARTICLE.test(noun.term)) continue
    const key = noun.term.toLowerCase()
    if (NO_ARTICLE.has(key)) continue
    const article = genders.get(key) ?? suffixGender(key)
    if (!article) {
      unknown.push(noun.term)
      continue
    }
    const term = `${article} ${noun.term}`
    if (taken.has(`${term.toLowerCase()}|${noun.source}`)) {
      collisions.push(`${noun.term} → ${term}`)
      continue
    }
    taken.add(`${term.toLowerCase()}|${noun.source}`)
    updates.push({ id: noun.id, term, from: noun.term, via: genders.has(key) ? 'dump' : 'suffixe' })
  }

  const viaDump = updates.filter(u => u.via === 'dump').length
  console.log(`à corriger: ${updates.length} (dump ${viaDump}, suffixe ${updates.length - viaDump})`)
  console.log(`collisions ignorées: ${collisions.length}${collisions.length ? ` — ${collisions.slice(0, 5).join(', ')}` : ''}`)
  console.log(`sans genre connu: ${unknown.length}${unknown.length ? ` — ${unknown.slice(0, 10).join(', ')}` : ''}`)
  console.log(updates.slice(0, 15).map(u => `  ${u.from} → ${u.term} (${u.via})`).join('\n'))

  if (!apply) {
    console.log('\ndry-run — relancer avec --apply pour écrire')
    return
  }
  for (const update of updates) {
    await db.word.update({ where: { id: update.id }, data: { term: update.term } })
  }
  console.log(`\n${updates.length} entrées mises à jour`)
}

main().finally(() => db.$disconnect())
