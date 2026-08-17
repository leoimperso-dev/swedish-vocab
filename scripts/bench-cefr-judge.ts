// Can a model be trusted to level our vocabulary?
//
// Frequency ranks a word by how often it is said, not by how hard it is:
// "husvagn" (caravan) and "nattvard" (holy communion) are equally rare and are
// not equally difficult. A model can judge the difference — but before letting
// it near the 60% of the vocabulary that has no usable rank, it has to prove
// itself on the part we already trust.
//
// So it is asked, blind, to level words whose rank is low enough that the
// frequency-derived band is sound (A1-B2, rank <= 5000), and the answers are
// compared. Exact agreement and off-by-one are both reported: for a floor on
// new words, one band out is a small error, three bands out is not.
//
// Usage: pnpm tsx scripts/bench-cefr-judge.ts [pair] [perBand]
import 'dotenv/config'
import OpenAI from 'openai'
import { db } from '../lib/db'
import { CEFR_LEVELS, type CefrLevel } from '../lib/cefr'
import { asPairId, PAIRS } from '../lib/courses'
import { PROVIDERS } from '../lib/chat/models'

const MODEL = 'llama-3.3-70b-versatile'
const BATCH = 30
// Above this rank the frequency-derived band is itself doubtful, so it cannot
// serve as the yardstick
const TRUSTED_MAX_RANK = 5000
const TRUSTED_BANDS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

const LANGUAGE_NAME: Record<string, string> = {
  sv: 'Swedish', en: 'English', nl: 'Dutch', es: 'Spanish', fr: 'French',
}

function prompt(language: string, items: Array<{ n: number; term: string; gloss: string }>): string {
  return [
    `You grade ${language} vocabulary for language learners.`,
    `For each numbered item, give the CEFR level at which a ${language} course would first teach that word: A1, A2, B1, B2, C1 or C2.`,
    `Judge how basic and how necessary the word is for a learner, not how rare it is in film subtitles.`,
    `Answer with one line per item, exactly "number|LEVEL", nothing else.`,
    ``,
    ...items.map(i => `${i.n}. ${i.term} — ${i.gloss}`),
  ].join('\n')
}

function parse(raw: string): Map<number, CefrLevel> {
  const out = new Map<number, CefrLevel>()
  for (const line of raw.split('\n')) {
    const m = line.match(/(\d+)\s*[|.:-]\s*([ABC][12])/i)
    if (m) out.set(Number(m[1]), m[2].toUpperCase() as CefrLevel)
  }
  return out
}

async function main() {
  const pair = asPairId(process.argv[2] ?? 'sv-fr')
  const perBand = Number(process.argv[3] ?? 30)
  const language = LANGUAGE_NAME[PAIRS[pair].term]
  const client = new OpenAI({
    apiKey: process.env[PROVIDERS.groq.envKey]!,
    baseURL: PROVIDERS.groq.baseURL(),
  })

  // Stratified: every trusted band contributes equally, or the sample is just
  // a picture of whichever band is biggest
  const sample: Array<{ term: string; gloss: string; ours: CefrLevel }> = []
  for (const band of TRUSTED_BANDS) {
    const rows = await db.$queryRaw<Array<{ term: string; translation: string }>>`
      SELECT term, translation FROM "Word"
      WHERE pair = ${pair} AND studyable = true AND cefr = ${band}
        AND "frequencyRank" IS NOT NULL AND "frequencyRank" <= ${TRUSTED_MAX_RANK}
      ORDER BY random() LIMIT ${perBand}
    `
    for (const r of rows) sample.push({ term: r.term, gloss: r.translation, ours: band })
  }
  console.log(`${pair} — ${sample.length} mots de référence (${TRUSTED_BANDS.join(', ')}, rang <= ${TRUSTED_MAX_RANK})`)

  const verdicts = new Map<number, CefrLevel>()
  for (let start = 0; start < sample.length; start += BATCH) {
    const slice = sample.slice(start, start + BATCH)
    const res = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: 'user', content: prompt(language, slice.map((s, i) => ({ n: start + i, term: s.term, gloss: s.gloss }))) }],
        max_completion_tokens: 700,
        temperature: 0,
      },
      { maxRetries: 1, timeout: 40000 },
    )
    for (const [n, lvl] of parse(res.choices[0]?.message?.content ?? '')) verdicts.set(n, lvl)
  }

  let judged = 0, exact = 0, within1 = 0
  const drift = new Map<number, number>()
  const far: string[] = []
  sample.forEach((s, i) => {
    const theirs = verdicts.get(i)
    if (!theirs) return
    judged++
    const d = CEFR_LEVELS.indexOf(theirs) - CEFR_LEVELS.indexOf(s.ours)
    drift.set(d, (drift.get(d) ?? 0) + 1)
    if (d === 0) exact++
    if (Math.abs(d) <= 1) within1++
    if (Math.abs(d) >= 2 && far.length < 12) far.push(`${s.term} — nous ${s.ours}, modèle ${theirs}  (${s.gloss.slice(0, 28)})`)
  })

  console.log(`jugés : ${judged} / ${sample.length}`)
  console.log(`accord exact : ${exact} (${((exact / judged) * 100).toFixed(1)} %)`)
  console.log(`à une bande près : ${within1} (${((within1 / judged) * 100).toFixed(1)} %)`)
  console.log('écart :', JSON.stringify(Object.fromEntries([...drift].sort((a, b) => a[0] - b[0]))))
  if (far.length) {
    console.log('\ndésaccords de 2 bandes ou plus :')
    for (const f of far) console.log('  ' + f)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
