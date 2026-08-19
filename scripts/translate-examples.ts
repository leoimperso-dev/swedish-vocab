// Fills in the missing translations of example sentences, with DeepL.
//
// Tatoeba pairs sentences by hand, so a large share of what it offers has no
// French counterpart: 41% of the Swedish sentences the app stores, and 2 424
// Swedish words whose *first* example is untranslated. Such a sentence teaches
// nothing — it cannot be a cloze, and in the vocabulary list it is a wall of
// Swedish with no way in.
//
// Only empty translations are filled. An existing one is never touched, however
// literal it looks: those are human translations, and this is a machine.
//
// Usage:
//   pnpm tsx scripts/translate-examples.ts <pair> [--limit N] [--dry]
import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { db } from '../lib/db'
import { asPairId, pairOf, type Lang } from '../lib/courses'

interface Example {
  term: string
  translation?: string
  blank: string
  manual?: boolean
}

// DeepL takes up to 50 texts per request; batching is what makes 6 000
// sentences a few minutes rather than an afternoon
const BATCH = 40
// The free tier allows a handful of requests per second — this stays well under
const PAUSE_MS = 250

const DEEPL_LANG: Partial<Record<Lang, string>> = {
  fr: 'FR', sv: 'SV', en: 'EN-GB', nl: 'NL', es: 'ES',
}

async function translateBatch(texts: string[], source: string, target: string): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY
  if (!key) throw new Error('DEEPL_API_KEY manquante — voir .env.example')
  // Free keys end in ":fx" and live on another host
  const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, source_lang: source, target_lang: target }),
  })
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { translations: Array<{ text: string }> }
  return data.translations.map(t => t.text)
}

async function main() {
  const pairArg = process.argv[2]
  if (!pairArg) {
    console.error('usage: pnpm tsx scripts/translate-examples.ts <pair> [--limit N] [--dry]')
    process.exit(1)
  }
  const pair = asPairId(pairArg)
  const dry = process.argv.includes('--dry')
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity

  const { term, translation } = pairOf(pair)
  const source = DEEPL_LANG[term]
  const target = DEEPL_LANG[translation]
  if (!source || !target) { console.error(`paire ${pair} non prise en charge`); process.exit(1) }

  const words = await db.word.findMany({
    where: { pair, examples: { not: Prisma.DbNull } },
    select: { id: true, examples: true },
  })

  // One sentence can illustrate several words: translate it once, write it
  // everywhere. Roughly a tenth of the calls saved, and no risk of two
  // different French renderings of the same sentence in the same session.
  const missing = new Map<string, Array<{ id: string; index: number }>>()
  for (const word of words) {
    const examples = (word.examples ?? []) as unknown as Example[]
    examples.forEach((example, index) => {
      if (example.translation) return
      const seats = missing.get(example.term) ?? []
      seats.push({ id: word.id, index })
      missing.set(example.term, seats)
    })
  }

  const sentences = [...missing.keys()].slice(0, limit)
  console.log(`${pair} : ${sentences.length} phrase(s) sans traduction, ${source} → ${target}`)
  if (sentences.length === 0) process.exit(0)

  const translations = new Map<string, string>()
  for (let i = 0; i < sentences.length; i += BATCH) {
    const batch = sentences.slice(i, i + BATCH)
    const out = await translateBatch(batch, source, target)
    batch.forEach((text, j) => translations.set(text, out[j]))
    console.log(`  ${Math.min(i + BATCH, sentences.length)}/${sentences.length}`)
    if (dry && i === 0) break
    await new Promise(r => setTimeout(r, PAUSE_MS))
  }

  for (const [text, translated] of [...translations].slice(0, dry ? 15 : 5)) {
    console.log(`\n  ${text}\n  -> ${translated}`)
  }
  if (dry) { console.log('\n(--dry : rien n’a été écrit)'); process.exit(0) }

  // Rewrite each touched word once, keeping every other field of the example
  const byWord = new Map<string, Map<number, string>>()
  for (const [text, seats] of missing) {
    const translated = translations.get(text)
    if (!translated) continue
    for (const seat of seats) {
      const slots = byWord.get(seat.id) ?? new Map<number, string>()
      slots.set(seat.index, translated)
      byWord.set(seat.id, slots)
    }
  }

  let written = 0
  for (const word of words) {
    const slots = byWord.get(word.id)
    if (!slots) continue
    const examples = (word.examples ?? []) as unknown as Example[]
    const next = examples.map((example, index) =>
      slots.has(index) ? { ...example, translation: slots.get(index)! } : example,
    )
    await db.word.update({ where: { id: word.id }, data: { examples: next as never } })
    written++
  }
  console.log(`\n${translations.size} phrase(s) traduite(s), ${written} mot(s) mis à jour`)
  process.exit(0)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
