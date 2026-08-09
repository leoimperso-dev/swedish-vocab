// Matches every Word of a pair to real Tatoeba sentences (CC-BY) and stores Word.examples.
// Translations are resolved through direct links, falling back to an English pivot
// when the learned language is not English itself.
// Usage: pnpm tsx scripts/build-examples.ts <dir-with-tatoeba-tsv-files> [pair]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import { PAIRS, asPairId, type Lang } from '../lib/courses'
import { headwordKey, isSuffixShorthand } from '../lib/morphology'

const MAX_EXAMPLES = 3
const MIN_LEN = 12
const MAX_LEN = 140

// Tatoeba uses ISO 639-3 codes in its file names
const TATOEBA_CODE: Record<Lang, string> = { sv: 'swe', fr: 'fra', en: 'eng' }

interface Example { term: string; translation?: string; blank: string }

function readTsv(file: string): string[][] {
  return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => l.split('\t'))
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[.,!?;:"«»()[\]…'’-]/g, '')
}

function wordKeys(term: string, forms: unknown, lang: Lang): { keys: string[]; phrases: string[] } {
  const keys = new Set<string>()
  const phrases = new Set<string>()
  const base = headwordKey(term, lang)
  if (!base) return { keys: [], phrases: [] }
  if (base.includes(' ')) phrases.add(base)
  else keys.add(base)
  if (forms && typeof forms === 'object') {
    for (const v of Object.values(forms as Record<string, unknown>)) {
      if (typeof v !== 'string') continue
      const form = v.toLowerCase().trim()
      if (form.length >= 3 && !form.includes(' ') && !isSuffixShorthand(form, lang)) keys.add(form)
    }
  }
  return { keys: [...keys], phrases: [...phrases] }
}

async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: tsx scripts/build-examples.ts <dir> [pair]'); process.exit(1) }
  const pair = asPairId(process.argv[3])
  const { term: termLang, translation: translationLang } = PAIRS[pair]
  const termCode = TATOEBA_CODE[termLang]
  const translationCode = TATOEBA_CODE[translationLang]
  // Direct link tables are sparse for smaller languages — English bridges the gap
  const pivotCode = termLang === 'en' || translationLang === 'en' ? null : TATOEBA_CODE.en

  console.log(`Parsing Tatoeba files for ${pair} (${termCode} → ${translationCode})...`)
  const termSentences = new Map<string, string>()
  for (const [id, , text] of readTsv(path.join(dir, `${termCode}_sentences.tsv`))) {
    if (text && text.length >= MIN_LEN && text.length <= MAX_LEN) termSentences.set(id, text)
  }
  const translationSentences = new Map<string, string>()
  for (const [id, , text] of readTsv(path.join(dir, `${translationCode}_sentences.tsv`))) {
    if (text) translationSentences.set(id, text)
  }

  const termToTranslation = new Map<string, string>()
  for (const [termId, trId] of readTsv(path.join(dir, `${termCode}-${translationCode}_links.tsv`))) {
    if (termSentences.has(termId) && translationSentences.has(trId)) termToTranslation.set(termId, trId)
  }
  if (pivotCode) {
    const pivotToTranslation = new Map<string, string>()
    for (const [pivotId, trId] of readTsv(path.join(dir, `${pivotCode}-${translationCode}_links.tsv`))) {
      if (!pivotToTranslation.has(pivotId) && translationSentences.has(trId)) {
        pivotToTranslation.set(pivotId, trId)
      }
    }
    for (const [termId, pivotId] of readTsv(path.join(dir, `${termCode}-${pivotCode}_links.tsv`))) {
      if (!termToTranslation.has(termId) && termSentences.has(termId)) {
        const trId = pivotToTranslation.get(pivotId)
        if (trId) termToTranslation.set(termId, trId)
      }
    }
  }
  console.log(`${termCode} sentences: ${termSentences.size}, translated: ${termToTranslation.size}`)

  // Token index over the learned-language sentences
  const index = new Map<string, string[]>()
  const normalized = new Map<string, string>()
  for (const [id, text] of termSentences) {
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

  const words = await db.word.findMany({ where: { pair }, select: { id: true, term: true, forms: true } })
  console.log(`Matching ${words.length} words...`)

  const updates: Array<{ id: string; examples: Example[] }> = []
  for (const word of words) {
    const { keys, phrases } = wordKeys(word.term, word.forms, termLang)
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
      const text = termSentences.get(sid)!
      const hasTranslation = termToTranslation.has(sid)
      const tokenCount = text.split(/\s+/).length
      // Prefer translated sentences, then a comfortable length (5-12 words)
      const lengthPenalty = tokenCount < 4 ? 3 : tokenCount > 12 ? tokenCount - 12 : 0
      return { sid, blank, score: (hasTranslation ? 0 : 100) + lengthPenalty + tokenCount * 0.01 }
    })
    scored.sort((a, b) => a.score - b.score)

    const seen = new Set<string>()
    const examples: Example[] = []
    for (const { sid, blank } of scored) {
      const text = termSentences.get(sid)!
      if (seen.has(text)) continue
      seen.add(text)
      const trId = termToTranslation.get(sid)
      examples.push({
        term: text,
        ...(trId ? { translation: translationSentences.get(trId)! } : {}),
        blank,
      })
      if (examples.length >= MAX_EXAMPLES) break
    }
    updates.push({ id: word.id, examples })
  }

  const withTranslation = updates.filter(u => u.examples[0]?.translation).length
  console.log(
    `Words with examples: ${updates.length} / ${words.length} (${withTranslation} with a translated best example)`
  )

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
