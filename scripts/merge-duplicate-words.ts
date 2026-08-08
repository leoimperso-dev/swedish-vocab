// Merges duplicate Word rows sharing the same pair, normalized headword AND wordType.
// Keeps the richest row (details > examples > frequencyRank > forms), migrates
// user progress and favorites, deletes the rest. Different wordTypes are kept
// (genuine homonyms like "militär" noun vs adjective).
import 'dotenv/config'
import { db } from '../lib/db'

function key(s: string): string {
  return s.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim().replace(/^(en|ett|att)\s+/, '')
}

function score(w: { details: unknown; examples: unknown; frequencyRank: number | null; forms: unknown }): number {
  return (w.details ? 4 : 0) + (Array.isArray(w.examples) ? 2 : 0) + (w.frequencyRank !== null ? 1 : 0) + (w.forms ? 1 : 0)
}

async function main() {
  const words = await db.word.findMany({
    select: { id: true, pair: true, term: true, wordType: true, details: true, examples: true, frequencyRank: true, forms: true },
  })
  const groups = new Map<string, typeof words>()
  for (const w of words) {
    const k = `${w.pair}|${key(w.term)}|${w.wordType}`
    const g = groups.get(k)
    if (g) g.push(w)
    else groups.set(k, [w])
  }

  let merged = 0
  let progressMigrated = 0
  for (const [, group] of groups) {
    if (group.length < 2) continue
    group.sort((a, b) => score(b) - score(a))
    const keep = group[0]
    for (const dup of group.slice(1)) {
      // Migrate progress rows that don't conflict with existing ones on the kept word
      const dupProgress = await db.userWord.findMany({ where: { wordId: dup.id } })
      for (const p of dupProgress) {
        const exists = await db.userWord.findUnique({
          where: { userId_wordId_direction: { userId: p.userId, wordId: keep.id, direction: p.direction } },
        })
        if (exists) {
          await db.userWord.delete({ where: { id: p.id } })
        } else {
          await db.userWord.update({ where: { id: p.id }, data: { wordId: keep.id } })
          progressMigrated++
        }
      }
      const dupFavs = await db.favorite.findMany({ where: { wordId: dup.id } })
      for (const f of dupFavs) {
        const exists = await db.favorite.findUnique({
          where: { userId_wordId: { userId: f.userId, wordId: keep.id } },
        })
        if (exists) await db.favorite.delete({ where: { id: f.id } })
        else await db.favorite.update({ where: { id: f.id }, data: { wordId: keep.id } })
      }
      await db.word.delete({ where: { id: dup.id } })
      merged++
    }
  }
  console.log(`Merged (deleted) ${merged} duplicate rows, migrated ${progressMigrated} progress rows`)
  console.log('Remaining words:', await db.word.count())
  process.exit(0)
}
main()
