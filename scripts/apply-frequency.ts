// Assigns Word.frequencyRank from a real frequency list (OpenSubtitles "word count" per line).
// Matches headword + inflected forms, keeps the best (lowest) rank.
// Usage: pnpm tsx scripts/apply-frequency.ts <path-to-sv_50k.txt>
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'

// Personal-file forms are often ending shorthands ("ar", "ade"), not real words
const SUFFIX_SHORTHANDS = new Set([
  'r', 'ar', 'er', 'a', 'de', 'ade', 'dde', 'te', 't', 'at', 'tt', 'it',
  'en', 'n', 'na', 'are', 'ast', 'aste',
])

function buildKeys(swedish: string, forms: unknown): string[] {
  const keys = new Set<string>()
  let base = swedish.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
  base = base.replace(/^(en|ett|att)\s+/, '')
  if (base) keys.add(base)
  const tokens = base.split(/\s+/)
  if (tokens.length > 1 && tokens[0]) keys.add(tokens[0])
  if (forms && typeof forms === 'object') {
    for (const value of Object.values(forms as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      const form = value.toLowerCase().trim()
      if (form.length >= 3 && !SUFFIX_SHORTHANDS.has(form)) keys.add(form)
    }
  }
  return [...keys]
}

async function main() {
  const listPath = process.argv[2]
  if (!listPath) { console.error('Usage: tsx scripts/apply-frequency.ts <sv_50k.txt>'); process.exit(1) }

  const rankByToken = new Map<string, number>()
  fs.readFileSync(listPath, 'utf-8').trim().split('\n').forEach((line, i) => {
    const token = line.split(' ')[0]
    if (token && !rankByToken.has(token)) rankByToken.set(token, i + 1)
  })
  console.log(`Frequency list: ${rankByToken.size} tokens`)

  const words = await db.word.findMany({ select: { id: true, swedish: true, forms: true } })
  const updates: Array<{ id: string; rank: number }> = []
  const allKeys = new Set<string>()

  for (const word of words) {
    const keys = buildKeys(word.swedish, word.forms)
    keys.forEach(k => allKeys.add(k))
    let best: number | null = null
    for (const key of keys) {
      const rank = rankByToken.get(key)
      if (rank !== undefined && (best === null || rank < best)) best = rank
    }
    if (best !== null) updates.push({ id: word.id, rank: best })
  }

  console.log(`Matched ${updates.length} / ${words.length} words`)

  const CHUNK = 1000
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    const values = chunk.map(u => `('${u.id}', ${u.rank})`).join(',')
    await db.$executeRawUnsafe(
      `UPDATE "Word" AS w SET "frequencyRank" = v.rank FROM (VALUES ${values}) AS v(id, rank) WHERE w.id = v.id`
    )
    console.log(`Updated ${Math.min(i + CHUNK, updates.length)} / ${updates.length}`)
  }

  // Coverage: how many of the real top-N tokens exist in our vocabulary keys
  for (const n of [1000, 2000, 3000, 5000]) {
    let covered = 0
    for (const [token, rank] of rankByToken) {
      if (rank <= n && allKeys.has(token)) covered++
    }
    console.log(`Coverage of real top ${n}: ${covered} (${Math.round((covered / n) * 100)}%)`)
  }
  process.exit(0)
}
main()
