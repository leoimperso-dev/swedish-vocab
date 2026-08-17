// Compares models on the one thing the conversation partner must not get
// wrong: correcting a learner's mistake.
//
// Scored on facts, not impressions — each case names the words the correction
// has to contain and the ones it must not, and three cases are already correct
// so a model that invents mistakes is caught too.
//
// Usage: pnpm tsx scripts/bench-chat-models.ts [provider:model ...]
//   pnpm tsx scripts/bench-chat-models.ts                                   (Groq's catalogue)
//   pnpm tsx scripts/bench-chat-models.ts openrouter:google/gemma-4-31b-it:free
//   pnpm tsx scripts/bench-chat-models.ts cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast
//
// A rung with no key configured is reported as such rather than silently skipped —
// a benchmark that quietly tests nothing is worse than one that fails.
import 'dotenv/config'
import OpenAI from 'openai'
import { buildSystemPrompt, splitCorrection } from '../lib/chat/prompt'
import type { Lang } from '../lib/courses'
import { PROVIDERS, TEMPERATURE } from '../lib/chat/models'

const DEFAULT_MODELS = [
  'groq:llama-3.3-70b-versatile',
  'groq:openai/gpt-oss-120b',
  'groq:openai/gpt-oss-20b',
  'groq:qwen/qwen3.6-27b',
  'groq:llama-3.1-8b-instant',
]

/** "openrouter:google/gemma-4-31b-it:free" → provider, then everything after the FIRST colon. */
function parseTarget(arg: string): { provider: string; model: string } {
  const at = arg.indexOf(':')
  if (at === -1 || !PROVIDERS[arg.slice(0, at)]) return { provider: 'groq', model: arg }
  return { provider: arg.slice(0, at), model: arg.slice(at + 1) }
}

const clients = new Map<string, OpenAI | null>()
function clientFor(name: string): OpenAI | null {
  if (clients.has(name)) return clients.get(name)!
  const provider = PROVIDERS[name]
  const apiKey = provider && process.env[provider.envKey]
  const baseURL = provider?.baseURL()
  const client = !apiKey || !baseURL
    ? null
    : new OpenAI({ apiKey, baseURL, defaultHeaders: { 'HTTP-Referer': 'https://swedish-vocab-chi.vercel.app', 'X-Title': 'Vocab' } })
  clients.set(name, client)
  return client
}

interface Case {
  lang: Lang
  sentence: string
  // null = the sentence is already correct and must draw no correction
  must: string[] | null
  mustNot?: string[]
}

const CASES: Case[] = [
  {
    lang: 'sv',
    sentence: 'Jag har gick till skolan igår och jag äta en äpple.',
    must: ['gick', 'åt', 'ett äpple'],
    mustNot: ['har gick', 'en äpple'],
  },
  {
    // V2 inversion, the rule Swedish learners break most
    lang: 'sv',
    sentence: 'Igår jag gick till affären och köpte två bok.',
    must: ['igår gick jag', 'böcker'],
    mustNot: ['igår jag gick'],
  },
  { lang: 'sv', sentence: 'Jag är tjugofem år gammal och jag bor i Stockholm.', must: null },
  {
    lang: 'nl',
    sentence: 'Ik heb gisteren naar school gegaan en ik eet een appel.',
    must: ['ben'],
    mustNot: ['heb gisteren naar school gegaan'],
  },
  { lang: 'nl', sentence: 'Ik ben moe want ik heb slecht geslapen.', must: null },
  {
    lang: 'es',
    sentence: 'Ayer yo he ido al mercado y compré dos manzana.',
    must: ['fui', 'manzanas'],
    mustNot: ['he ido'],
  },
  { lang: 'es', sentence: 'Me gusta mucho el café por la mañana.', must: null },
  {
    lang: 'en',
    sentence: 'Yesterday I have went to the shop and I buy two bread.',
    must: ['went', 'bought'],
    mustNot: ['have went'],
  },
]

// The reason after the dash must be French — models drift into the language
// they are speaking
const FRENCH_HINTS = /\b(le|la|les|un|une|de|du|des|au|pas|avec|verbe|accord|pluriel|temps|article|sujet|présent|passé|prétérit|conjugaison|féminin|masculin|ordre|mots|auxiliaire)\b|[éèêàçô]/i

async function main() {
  const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_MODELS
  const scores = new Map<string, { good: number; bad: number; missed: number; invented: number; french: number; ms: number }>()

  for (const target of targets) {
    const { provider, model } = parseTarget(target)
    const client = clientFor(provider)
    console.log(`\n===== ${provider}:${model}`)
    if (!client) {
      console.log(`  (ignoré — ${PROVIDERS[provider]?.envKey ?? provider} absent de .env)`)
      continue
    }
    const score = { good: 0, bad: 0, missed: 0, invented: 0, french: 0, ms: 0 }
    for (const test of CASES) {
      const system = buildSystemPrompt(test.lang, 'fr', 'A2', null)
      const started = Date.now()
      let raw = ''
      try {
        const res = await client.chat.completions.create(
          {
            model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: test.sentence }],
            max_completion_tokens: 250,
            // Test what production actually sends, not a tidier setting
            temperature: TEMPERATURE,
          },
          { maxRetries: 1, timeout: 30000 },
        )
        raw = res.choices[0]?.message?.content ?? ''
      } catch (e) {
        console.log(`  ERREUR  ${(e as Error).message.slice(0, 60)}`)
        score.bad++
        continue
      }
      score.ms += Date.now() - started

      const { correction } = splitCorrection(raw)
      const dash = correction.indexOf(' — ')
      const fixed = (dash === -1 ? correction : correction.slice(0, dash)).toLowerCase()
      const reason = dash === -1 ? '' : correction.slice(dash + 3)

      if (test.must === null) {
        if (correction) {
          score.invented++
          console.log(`  ✗ correction inventée sur « ${test.sentence.slice(0, 34)}… » → ${correction.slice(0, 60)}`)
        } else {
          score.good++
        }
        continue
      }

      if (!correction) {
        score.missed++
        console.log(`  ✗ faute manquée [${test.lang}] ${test.sentence.slice(0, 40)}…`)
        continue
      }
      const missing = test.must.filter(w => !fixed.includes(w.toLowerCase()))
      const forbidden = (test.mustNot ?? []).filter(w => fixed.includes(w.toLowerCase()))
      if (missing.length === 0 && forbidden.length === 0) {
        score.good++
        if (FRENCH_HINTS.test(reason)) score.french++
        console.log(`  ✓ [${test.lang}] ${correction.slice(0, 78)}`)
      } else {
        score.bad++
        console.log(`  ✗ [${test.lang}] ${correction.slice(0, 78)}`)
        if (missing.length) console.log(`      manque : ${missing.join(', ')}`)
        if (forbidden.length) console.log(`      garde la faute : ${forbidden.join(', ')}`)
      }
    }
    scores.set(`${provider}:${model}`, score)
  }

  const corrigible = CASES.filter(c => c.must !== null).length
  console.log('\n\n===== BILAN')
  console.log('fournisseur:modèle'.padEnd(40) + 'justes  fausses  manquées  inventées  raison_fr  ms/appel')
  for (const [model, s] of scores) {
    console.log(
      model.padEnd(40) +
      String(s.good).padStart(6) +
      String(s.bad).padStart(9) +
      String(s.missed).padStart(10) +
      String(s.invented).padStart(11) +
      `${s.french}/${corrigible}`.padStart(11) +
      String(Math.round(s.ms / CASES.length)).padStart(10),
    )
  }
  console.log(`\n(${CASES.length} cas dont ${CASES.length - corrigible} déjà corrects)`)
}
main().catch(e => { console.error(e); process.exit(1) })
