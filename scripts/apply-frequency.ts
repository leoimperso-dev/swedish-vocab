// Assigns Word.frequencyRank from a real frequency list (OpenSubtitles "word count" per line).
// Matches headword + inflected forms, keeps the best (lowest) rank.
// Usage: pnpm tsx scripts/apply-frequency.ts <path-to-xx_50k.txt> [pair]
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'
import { PAIRS, asPairId, type Lang } from '../lib/courses'
import { headwordKey, isSuffixShorthand } from '../lib/morphology'
import { resolveKeyOwnership } from './key-ownership'

function buildKeys(term: string, forms: unknown, lang: Lang): string[] {
  const keys = new Set<string>()
  const base = headwordKey(term, lang)
  if (base) keys.add(base)
  const tokens = base.split(/\s+/)
  if (tokens.length > 1 && tokens[0]) keys.add(tokens[0])
  if (forms && typeof forms === 'object') {
    for (const value of Object.values(forms as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      const form = value.toLowerCase().trim()
      if (form.length >= 3 && !isSuffixShorthand(form, lang)) keys.add(form)
    }
  }
  return [...keys]
}

async function main() {
  const listPath = process.argv[2]
  if (!listPath) { console.error('Usage: tsx scripts/apply-frequency.ts <xx_50k.txt> [pair]'); process.exit(1) }
  const pair = asPairId(process.argv[3])
  const lang = PAIRS[pair].term

  const rankByToken = new Map<string, number>()
  fs.readFileSync(listPath, 'utf-8').trim().split('\n').forEach((line, i) => {
    const token = line.split(' ')[0]
    if (token && !rankByToken.has(token)) rankByToken.set(token, i + 1)
  })
  console.log(`Frequency list: ${rankByToken.size} tokens`)

  const words = await db.word.findMany({
    where: { pair },
    select: { id: true, term: true, forms: true, wordType: true },
  })

  // Homographs: a surface key feeds the rank of exactly one word (see key-ownership.ts)
  const claimants = words.map(w => ({
    id: w.id,
    wordType: w.wordType,
    headKey: headwordKey(w.term, lang),
    keys: buildKeys(w.term, w.forms, lang),
  }))
  const allowed = resolveKeyOwnership(claimants, k => rankByToken.get(k))

  const updates: Array<{ id: string; rank: number | null }> = []
  const allKeys = new Set<string>()

  for (const c of claimants) {
    c.keys.forEach(k => allKeys.add(k))
    let best: number | null = null
    for (const key of allowed.get(c.id) ?? []) {
      const rank = rankByToken.get(key)
      if (rank !== undefined && (best === null || rank < best)) best = rank
    }
    // Also reset ranks a word no longer owns (from earlier runs of this script)
    updates.push({ id: c.id, rank: best })
  }

  console.log(`Matched ${updates.filter(u => u.rank !== null).length} / ${words.length} words`)

  const CHUNK = 1000
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    const values = chunk.map(u => `('${u.id}', ${u.rank ?? 'NULL'})`).join(',')
    await db.$executeRawUnsafe(
      `UPDATE "Word" AS w SET "frequencyRank" = v.rank::int FROM (VALUES ${values}) AS v(id, rank) WHERE w.id = v.id`
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
