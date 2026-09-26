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
//   pnpm tsx scripts/warm-tts.ts --pair sv-fr --side translation --scope words --write
//
// `--side` picks which language is synthesized. The default `term` is the one
// being learned and covers almost everything the app says; `translation` is
// needed only because the vocabulary list reads a word and then its gloss.
// The translation side is shared by every pair, so warming it once for one
// pair already covers the French of the others.
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

// Bounded by Supabase Storage rather than by Azure: the bucket starts
// answering 429 above this, and a refused upload wastes characters that were
// already synthesized
const CONCURRENCY = 3

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const WRITE = process.argv.includes('--write')

// Paragraph boundary, the unit a story is read in
const SPLIT = /\n\n+/

type Side = 'term' | 'translation'

/** Every utterance of a pair that the app may need to say, deduplicated. */
async function collect(pair: PairId, scopes: Scope[], side: Side): Promise<string[]> {
  const texts: string[] = []

  if (scopes.includes('words') || scopes.includes('examples')) {
    // Not restricted to `studyable`: an entry excluded from exercises is
    // still shown in the dictionary and read aloud by the list player, and a
    // gap there is exactly what makes a playlist stutter.
    const words = await db.word.findMany({
      where: { pair },
      select: { term: true, translation: true, examples: true },
    })
    for (const w of words) {
      if (scopes.includes('words')) texts.push(side === 'term' ? w.term : w.translation)
      if (scopes.includes('examples')) {
        const ex = w.examples as { term?: string; translation?: string }[] | null
        if (Array.isArray(ex)) {
          for (const e of ex) {
            const text = side === 'term' ? e?.term : e?.translation
            if (text) texts.push(text)
          }
        }
      }
    }
  }
  if (scopes.includes('stories')) {
    const stories = await db.story.findMany({
      where: { pair },
      select: { body: true, bodyTranslated: true },
    })
    // Split the way the reader reads it: one utterance per paragraph
    for (const s of stories) {
      const body = side === 'term' ? s.body : s.bodyTranslated
      if (body) texts.push(...body.split(SPLIT))
    }
  }
  if (scopes.includes('dialogues')) {
    const dialogues = await db.dialogue.findMany({ where: { pair }, select: { turns: true } })
    for (const d of dialogues) {
      const turns = d.turns as { text?: string; translation?: string }[]
      if (Array.isArray(turns)) {
        for (const t of turns) {
          const text = side === 'term' ? t?.text : t?.translation
          if (text) texts.push(text)
        }
      }
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

  const side = (arg('side') ?? 'term') as Side
  if (side !== 'term' && side !== 'translation') throw new Error(`unknown side: ${side}`)
  const locale = localeOf(pairOf(pair)[side])
  const voice = arg('voice') ?? defaultServerVoice(locale)
  if (!voice) throw new Error(`no server voice for ${locale}`)

  const texts = (await collect(pair, scopes, side)).slice(0, limit)
  const chars = texts.reduce((a, t) => a + t.length, 0)
  console.log(`${pair} · ${side} · ${scopes.join(',')} · voix ${voice}`)
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
      // A dropped connection must not leave a permanent hole in the corpus:
      // the run is long, and a single flaky minute would otherwise cost every
      // utterance attempted during it
      let error: Error | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))
        try {
          if (await hasAudio(key, voice)) { skipped++; error = null; break }
          await putAudio(key, voice, await synthesize(text, voice))
          made++
          error = null
          break
        } catch (e) {
          error = e as Error
        }
      }
      if (error) {
        failed++
        if (failed <= 5) console.error(`  ✗ ${text.slice(0, 40)} — ${error.message}`)
      }
      if (++done % 200 === 0) console.log(`  ${done}/${texts.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`\n✅ ${made} créés · ${skipped} déjà là · ${failed} échecs`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
