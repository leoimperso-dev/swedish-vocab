// Synthesizes the corpus ahead of time, so nothing is ever heard for the first
// time at the speed of a cold API call.
//
// Optional by design: a miss is synthesized on demand by /api/tts and cached
// from then on. Warming only buys latency on the first encounter — and a
// predictable bill, since it says up front how many characters it will spend.
//
// Usage:
//   pnpm tsx scripts/warm-tts.ts --pair sv-fr --scope words           # dry run
//   pnpm tsx scripts/warm-tts.ts --pair sv-fr --scope words --write
//   pnpm tsx scripts/warm-tts.ts --pair sv-fr --scope words,stories,dialogues --write --limit 2000
//
// Scopes, cheapest first:
//   words      headwords of the learned side          (~128k chars for sv-fr)
//   stories    reading texts, one paragraph per file  (~61k)
//   dialogues  spoken turns                           (~14k)
//   examples   Tatoeba example sentences              (~500k — the expensive one)
import 'dotenv/config'
import { db } from '../lib/db'
import { audioKey, defaultServerVoice } from '../lib/tts/catalog'
import { hasAudio, putAudio, storageConfigured } from '../lib/tts/storage'
import { MAX_CHARS, provider, synthesize } from '../lib/tts/synthesize'
import { speakable } from '../lib/tts'
import { asPairId, localeOf, pairOf, type PairId } from '../lib/courses'

type Scope = 'words' | 'stories' | 'dialogues' | 'examples'
const ALL_SCOPES: Scope[] = ['words', 'stories', 'dialogues', 'examples']

// Azure allows far more, but a burst of failures is cheaper to notice slowly
const CONCURRENCY = 4

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const WRITE = process.argv.includes('--write')

/** Every utterance of a pair that the app may need to say, deduplicated. */
async function collect(pair: PairId, scopes: Scope[]): Promise<string[]> {
  const texts: string[] = []

  if (scopes.includes('words') || scopes.includes('examples')) {
    const words = await db.word.findMany({
      where: { pair, studyable: true },
      select: { term: true, examples: true },
    })
    for (const w of words) {
      if (scopes.includes('words')) texts.push(w.term)
      if (scopes.includes('examples')) {
        const ex = w.examples as { term?: string }[] | null
        if (Array.isArray(ex)) for (const e of ex) if (e?.term) texts.push(e.term)
      }
    }
  }
  if (scopes.includes('stories')) {
    const stories = await db.story.findMany({ where: { pair }, select: { body: true } })
    // Split the way the reader reads it: one utterance per paragraph
    for (const s of stories) texts.push(...s.body.split(/\n\n+/))
  }
  if (scopes.includes('dialogues')) {
    const dialogues = await db.dialogue.findMany({ where: { pair }, select: { turns: true } })
    for (const d of dialogues) {
      const turns = d.turns as { text?: string }[]
      if (Array.isArray(turns)) for (const t of turns) if (t?.text) texts.push(t.text)
    }
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of texts) {
    // Exactly what the browser will hash: anything else and the file is
    // written under an address nothing ever looks up
    const text = speakable(raw)
    if (!text || text.length > MAX_CHARS || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

async function main() {
  const pair = asPairId(arg('pair') ?? 'sv-fr')
  const scopes = (arg('scope') ?? 'words').split(',').map(s => s.trim()) as Scope[]
  const limit = Number(arg('limit') ?? 0) || Infinity
  const bad = scopes.filter(s => !ALL_SCOPES.includes(s))
  if (bad.length) throw new Error(`unknown scope: ${bad.join(', ')}`)

  const locale = localeOf(pairOf(pair).term)
  const voice = arg('voice') ?? defaultServerVoice(locale)
  if (!voice) throw new Error(`no server voice for ${locale}`)

  const texts = (await collect(pair, scopes)).slice(0, limit)
  const chars = texts.reduce((a, t) => a + t.length, 0)
  console.log(`${pair} · ${scopes.join(',')} · voix ${voice}`)
  console.log(`${texts.length.toLocaleString()} énoncés, ${chars.toLocaleString()} caractères`)
  console.log(`coût Azure au tarif standard : ~${(chars / 1e6 * 16).toFixed(2)} $`)

  if (!WRITE) return console.log('\n(essai à blanc — relance avec --write)')
  if (!provider()) throw new Error('aucun fournisseur TTS configuré')
  if (!storageConfigured()) throw new Error('stockage non configuré')

  let done = 0, made = 0, skipped = 0, failed = 0
  const queue = [...texts]
  const worker = async () => {
    for (;;) {
      const text = queue.shift()
      if (!text) return
      const key = await audioKey(text, voice)
      try {
        if (await hasAudio(key, voice)) skipped++
        else {
          await putAudio(key, voice, await synthesize(text, voice))
          made++
        }
      } catch (e) {
        failed++
        if (failed <= 5) console.error(`  ✗ ${text.slice(0, 40)} — ${(e as Error).message}`)
      }
      if (++done % 200 === 0) console.log(`  ${done}/${texts.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`\n✅ ${made} créés · ${skipped} déjà là · ${failed} échecs`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
