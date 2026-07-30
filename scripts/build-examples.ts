// Matches every Word to real Tatoeba sentences (CC-BY) and stores Word.examples.
// French translations resolved via direct swe-fra links, then the English pivot.
// Usage: pnpm tsx scripts/build-examples.ts <dir-with-tatoeba-tsv-files>
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'

const MAX_EXAMPLES = 3
const MIN_LEN = 12
const MAX_LEN = 140

const SUFFIX_SHORTHANDS = new Set([
  'r', 'ar', 'er', 'a', 'de', 'ade', 'dde', 'te', 't', 'at', 'tt', 'it',
  'en', 'n', 'na', 'are', 'ast', 'aste',
])

interface Example { sv: string; fr?: string; blank: string }

function readTsv(file: string): string[][] {
  return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => l.split('\t'))
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[.,!?;:"«»()[\]…'’-]/g, '')
}

function wordKeys(swedish: string, forms: unknown): { keys: string[]; phrases: string[] } {
  const keys = new Set<string>()
  const phrases = new Set<string>()
  let base = swedish.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
  base = base.replace(/^(en|ett|att)\s+/, '')
  if (!base) return { keys: [], phrases: [] }
  if (base.includes(' ')) phrases.add(base)
  else keys.add(base)
  if (forms && typeof forms === 'object') {
    for (const v of Object.values(forms as Record<string, unknown>)) {
      if (typeof v !== 'string') continue
      const form = v.toLowerCase().trim()
      if (form.length >= 3 && !form.includes(' ') && !SUFFIX_SHORTHANDS.has(form)) keys.add(form)
    }
  }
  return { keys: [...keys], phrases: [...phrases] }
}

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/build-examples.ts <dir>'); process.exit(1) }

  console.log('Parsing Tatoeba files...')
  const svSentences = new Map<string, string>()
  for (const [id, , text] of readTsv(path.join(dir, 'swe_sentences.tsv'))) {
    if (text && text.length >= MIN_LEN && text.length <= MAX_LEN) svSentences.set(id, text)
  }
  const fraSentences = new Map<string, string>()
  for (const [id, , text] of readTsv(path.join(dir, 'fra_sentences.tsv'))) {
    if (text) fraSentences.set(id, text)
  }

  // sv -> fr sentence id: direct links first, then via the English pivot
  const svToFr = new Map<string, string>()
  for (const [svId, frId] of readTsv(path.join(dir, 'swe-fra_links.tsv'))) {
    if (svSentences.has(svId) && fraSentences.has(frId)) svToFr.set(svId, frId)
  }
  const engToFr = new Map<string, string>()
  for (const [engId, frId] of readTsv(path.join(dir, 'eng-fra_links.tsv'))) {
    if (!engToFr.has(engId) && fraSentences.has(frId)) engToFr.set(engId, frId)
  }
  for (const [svId, engId] of readTsv(path.join(dir, 'swe-eng_links.tsv'))) {
    if (!svToFr.has(svId) && svSentences.has(svId)) {
      const frId = engToFr.get(engId)
      if (frId) svToFr.set(svId, frId)
    }
  }
  console.log(`sv sentences: ${svSentences.size}, with fr translation: ${svToFr.size}`)

  // Token index over Swedish sentences
  const index = new Map<string, string[]>()
  const normalized = new Map<string, string>()
  for (const [id, text] of svSentences) {
    const norm = ' ' + text.toLowerCase().replace(/[.,!?;:"«»()[\]…'’]/g, ' ').replace(/\s+/g, ' ').trim() + ' '
    normalized.set(id, norm)
    const seen = new Set<string>()
    for (const raw of norm.trim().split(' ')) {
      const token = normalizeToken(raw)
      if (!token || seen.has(token)) continue
      seen.add(token)
      const list = index.get(token)
      if (list) list.push(id)
      else index.set(token, [id])
    }
  }

  const words = await db.word.findMany({ select: { id: true, swedish: true, forms: true } })
  console.log(`Matching ${words.length} words...`)

  const updates: Array<{ id: string; examples: Example[] }> = []
  for (const word of words) {
    const { keys, phrases } = wordKeys(word.swedish, word.forms)
    const candidates = new Map<string, string>() // sentenceId -> blank surface form

    for (const key of keys) {
      for (const sid of index.get(key) ?? []) {
        if (!candidates.has(sid)) candidates.set(sid, key)
      }
    }
    for (const phrase of phrases) {
      const first = phrase.split(' ')[0]
      for (const sid of index.get(first) ?? []) {
        if (!candidates.has(sid) && normalized.get(sid)!.includes(' ' + phrase + ' ')) {
          candidates.set(sid, phrase)
        }
      }
    }
    if (candidates.size === 0) continue

    const scored = [...candidates.entries()].map(([sid, blank]) => {
      const text = svSentences.get(sid)!
      const hasFr = svToFr.has(sid)
      const tokenCount = text.split(/\s+/).length
      // Prefer translated sentences, then a comfortable length (5-12 words)
      const lengthPenalty = tokenCount < 4 ? 3 : tokenCount > 12 ? tokenCount - 12 : 0
      return { sid, blank, score: (hasFr ? 0 : 100) + lengthPenalty + tokenCount * 0.01 }
    })
    scored.sort((a, b) => a.score - b.score)

    const seen = new Set<string>()
    const examples: Example[] = []
    for (const { sid, blank } of scored) {
      const sv = svSentences.get(sid)!
      if (seen.has(sv)) continue
      seen.add(sv)
      const frId = svToFr.get(sid)
      examples.push({ sv, ...(frId ? { fr: fraSentences.get(frId)! } : {}), blank })
      if (examples.length >= MAX_EXAMPLES) break
    }
    updates.push({ id: word.id, examples })
  }

  const withFr = updates.filter(u => u.examples[0]?.fr).length
  console.log(`Words with examples: ${updates.length} / ${words.length} (${withFr} with a translated best example)`)

  const CHUNK = 200
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    const values: string[] = []
    const params: string[] = []
    chunk.forEach((u, j) => {
      values.push(`($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`)
      params.push(u.id, JSON.stringify(u.examples))
    })
    await db.$executeRawUnsafe(
      `UPDATE "Word" AS w SET "examples" = v.examples FROM (VALUES ${values.join(',')}) AS v(id, examples) WHERE w.id = v.id`,
      ...params
    )
  }
  console.log('Done')
  process.exit(0)
}
main()
