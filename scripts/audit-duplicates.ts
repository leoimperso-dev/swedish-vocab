// Finds headwords served as two cards in the same course.
//
// The unique key is [pair, term, wordType, source], so the same word imported
// from two files, or capitalised differently, produces two rows — two cards to
// answer, and an SM-2 progression split between them. Two rows are legitimate
// only when they are genuinely different words: "watch" the verb and "watch"
// the noun deserve their own card.
//
// Usage: pnpm tsx scripts/audit-duplicates.ts [--list]
import 'dotenv/config'
import { db } from '../lib/db'
import { glossesOverlap } from '../lib/gloss'
import { PAIRS, type PairId } from '../lib/courses'

// The article is part of the headword, not of the word's identity
const ARTICLE = /^(en|ett|att|to|de|het|el|la|los|las)\s+/

function identityOf(term: string): string {
  return term.toLowerCase().trim().replace(ARTICLE, '')
}

async function main() {
  const list = process.argv.includes('--list')

  for (const pair of Object.keys(PAIRS) as PairId[]) {
    const words = await db.word.findMany({
      where: { pair, studyable: true },
      select: { id: true, term: true, translation: true, wordType: true, source: true, frequencyRank: true },
      orderBy: { frequencyRank: { sort: 'asc', nulls: 'last' } },
    })

    const groups = new Map<string, typeof words>()
    for (const word of words) {
      const key = identityOf(word.term)
      const group = groups.get(key)
      if (group) group.push(word)
      else groups.set(key, [word])
    }

    let redundant = 0, distinct = 0
    const samples: string[] = []
    for (const [key, group] of groups) {
      if (group.length < 2) continue
      // Same part of speech AND overlapping senses: the same word twice
      const sameWord = group.every(w => w.wordType === group[0].wordType)
        && group.slice(1).every(w => glossesOverlap(w.translation, group[0].translation))
      if (sameWord) {
        redundant++
        if (samples.length < 12) {
          samples.push(`${key}: ` + group.map(w => `«${w.translation}» (${w.source ?? '?'})`).join(' + '))
        }
      } else {
        distinct++
      }
    }
    console.log(
      `${pair}: ${redundant} vrais doublons, ${distinct} homographes légitimes ` +
      `(verbe/nom, adjectif/adverbe…)`,
    )
    if (list) for (const s of samples) console.log('   ' + s)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
