import 'dotenv/config'
import { db } from '../lib/db'
import { lookupWord } from '../lib/dictionary'
import type { PairId } from '../lib/courses'

// QA tool: every word of every story must resolve in the dictionary.
// Usage: pnpm tsx scripts/check-story-coverage.ts
// Same tokenization as StoryReader.handleWordTap
function tokenize(body: string): string[] {
  return body.split(/(\s+)/)
    .filter(t => !/^\s*$/.test(t))
    .map(t => t.toLowerCase().replace(/[.,!?;:"«»()[\]…'’„“”–—]/g, '').trim())
    .filter(Boolean)
}

async function main() {
  for (const pair of ['sv-fr', 'en-fr', 'nl-fr'] as PairId[]) {
    const stories = await db.story.findMany({ where: { pair }, select: { slug: true, body: true } })
    const missing = new Map<string, Set<string>>() // token -> slugs
    let total = 0, ok = 0
    for (const story of stories) {
      for (const token of new Set(tokenize(story.body))) {
        total++
        const hit = await lookupWord(token, pair)
        if (hit) { ok++; continue }
        if (!missing.has(token)) missing.set(token, new Set())
        missing.get(token)!.add(story.slug)
      }
    }
    console.log(`\n=== ${pair}: ${ok}/${total} tokens uniques couverts, ${missing.size} manquants ===`)
    const sorted = [...missing.entries()].sort((a, b) => b[1].size - a[1].size)
    for (const [token, slugs] of sorted) console.log(`${token}  (${slugs.size} histoire${slugs.size > 1 ? 's' : ''})`)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
