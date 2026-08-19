// Merges the duplicate entries of a headword into one.
//
// The dictionary was seeded from several curated lists plus a Wiktionary
// extraction, and the unique key is (pair, term, wordType, source) — so the
// same word imported from two sources became two rows. 1 626 extra rows in
// sv-fr, 2 778 in en-fr. The learner meets the same word twice in a session,
// each with its own SM-2 schedule and its own half of the meaning ("ovan" was
// "peu habitué" in one row and "plus haut" in the other).
//
// Merging, not deleting: the surviving row takes the union of the glosses, the
// richest forms, every example, and every learner's progress. A sense that
// exists only in the loser would otherwise disappear.
//
// A word split across parts of speech is a second, milder case: the Wiktionary
// extraction listed "okay" five times (adjective, adverb, function, noun, verb),
// each with its own schedule. --cross-type merges those, but only when the
// glosses actually overlap — "blind" the adjective and "blind" the noun (un
// store) are two words that happen to share a spelling, and merging them would
// invent a meaning.
//
// Usage: pnpm tsx scripts/dedupe-words.ts <pair> [--cross-type] [--dry]
import 'dotenv/config'
import { db } from '../lib/db'
import { asPairId } from '../lib/courses'

interface Example { term: string; translation?: string; blank: string; manual?: boolean }

// Seeding left bookkeeping notes in a few glosses; they are not translations
const JUNK = /\[?\s*doublon[^\]]*\]?/gi

function cleanGloss(gloss: string): string {
  return gloss.replace(JUNK, '').replace(/\s{2,}/g, ' ').replace(/^[\s,;/]+|[\s,;/]+$/g, '').trim()
}

/**
 * Union of the glosses, kept as written.
 *
 * `glossSenses` is for *comparing* meanings, not for display: it reduces
 * "un martin-pêcheur" to "martin" and drops accents. The merged gloss is what
 * the learner reads and types, so each fragment survives verbatim; only the
 * comparison that decides whether two fragments say the same thing is
 * normalised.
 */
function fragmentKey(fragment: string): string {
  return fragment
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    // Longest first: an alternation matches "un" inside "une" otherwise, which
    // left "e rose" and made "rose" and "une rose" look like two senses
    .replace(/^(de la|une|les|des|los|las|los|un|le|la|du|l')\s+|^l'/, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Splits on the separators between senses only — a comma inside brackets
 * belongs to one sense. Splitting blindly turned "(particule : sans doute,
 * probablement, assez)" into three fragments, the first of which kept an
 * unclosed bracket.
 */
function splitSenses(gloss: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of gloss) {
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && (char === ',' || char === ';' || char === '/')) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

function mergeGlosses(glosses: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const gloss of glosses) {
    for (const raw of splitSenses(cleanGloss(gloss))) {
      const fragment = raw.trim()
      const key = fragmentKey(fragment)
      if (!fragment || !key || seen.has(key)) continue
      seen.add(key)
      out.push(fragment)
    }
  }
  return out.join(', ')
}

async function main() {
  const pair = asPairId(process.argv[2])
  const dry = process.argv.includes('--dry')

  const words = await db.word.findMany({
    where: { pair },
    select: {
      id: true, term: true, translation: true, wordType: true, forms: true, details: true,
      examples: true, frequencyRank: true, cefr: true, category: true, source: true, studyable: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const crossType = process.argv.includes('--cross-type')
  const groups = new Map<string, typeof words>()
  for (const word of words) {
    // Word type is part of the identity by default: "en vad" (le mollet) and
    // "vad" the interrogative are different words sharing a spelling.
    const key = crossType
      ? word.term.trim().toLowerCase()
      : `${word.term.trim().toLowerCase()}|${word.wordType}`
    groups.set(key, [...(groups.get(key) ?? []), word])
  }
  let duplicated = [...groups.values()].filter(g => g.length > 1)
  if (crossType) {
    // Only rows that already agree on some part of the meaning. Without this,
    // every homograph in the dictionary would be collapsed into one entry.
    duplicated = duplicated
      .map(group => {
        const keys = group.map(w => new Set(splitSenses(cleanGloss(w.translation)).map(fragmentKey)))
        const head = keys[0]
        return group.filter((_, i) => i === 0 || [...keys[i]].some(k => head.has(k)))
      })
      .filter(group => group.length > 1)
  }
  console.log(`${pair} : ${duplicated.length} mot(s) en double, ${duplicated.reduce((n, g) => n + g.length - 1, 0)} ligne(s) en trop`)

  let merged = 0
  for (const group of duplicated) {
    // The keeper is the row a learner is most likely to already be on: most
    // examples, then a real frequency rank, then the oldest.
    const keeper = [...group].sort((a, b) => {
      const ea = (a.examples as unknown as Example[] | null)?.length ?? 0
      const eb = (b.examples as unknown as Example[] | null)?.length ?? 0
      if (ea !== eb) return eb - ea
      const ra = a.frequencyRank ?? Number.MAX_SAFE_INTEGER
      const rb = b.frequencyRank ?? Number.MAX_SAFE_INTEGER
      if (ra !== rb) return ra - rb
      return a.createdAt.getTime() - b.createdAt.getTime()
    })[0]
    const losers = group.filter(w => w.id !== keeper.id)

    const translation = mergeGlosses([keeper.translation, ...losers.map(l => l.translation)])
    // Every example, keeper's first, deduplicated on the sentence
    const seenSentences = new Set<string>()
    const examples: Example[] = []
    for (const word of [keeper, ...losers]) {
      for (const example of ((word.examples ?? []) as unknown as Example[])) {
        if (seenSentences.has(example.term)) continue
        seenSentences.add(example.term)
        examples.push(example)
      }
    }
    const forms = keeper.forms ?? losers.find(l => l.forms)?.forms ?? null
    const details = keeper.details ?? losers.find(l => l.details)?.details ?? null
    const frequencyRank = keeper.frequencyRank ?? losers.find(l => l.frequencyRank != null)?.frequencyRank ?? null

    if (dry) {
      const spotlight = ['ovan', 'väl', 'nog', 'flott', 'ett löv', 'ett band', 'en ålder']
      if (merged < 15 || spotlight.includes(keeper.term.toLowerCase())) {
        console.log(`\n  ${keeper.term} (${keeper.wordType}) ← ${losers.length} doublon(s)`)
        console.log(`    ${group.map(w => w.translation).join('  ||  ')}`)
        console.log(`    => ${translation}`)
      }
      merged++
      continue
    }

    await db.$transaction(async tx => {
      for (const loser of losers) {
        // Progress moves to the keeper, unless the learner already has a row
        // there: two schedules for one word cannot be added up, so the loser's
        // is dropped rather than guessed at.
        const progress = await tx.userWord.findMany({ where: { wordId: loser.id } })
        for (const row of progress) {
          const existing = await tx.userWord.findUnique({
            where: { userId_wordId_direction: { userId: row.userId, wordId: keeper.id, direction: row.direction } },
          })
          if (existing) await tx.userWord.delete({ where: { id: row.id } })
          else await tx.userWord.update({ where: { id: row.id }, data: { wordId: keeper.id } })
        }
        const favorites = await tx.favorite.findMany({ where: { wordId: loser.id } })
        for (const favorite of favorites) {
          const existing = await tx.favorite.findUnique({
            where: { userId_wordId: { userId: favorite.userId, wordId: keeper.id } },
          })
          if (existing) await tx.favorite.delete({ where: { id: favorite.id } })
          else await tx.favorite.update({ where: { id: favorite.id }, data: { wordId: keeper.id } })
        }
        await tx.errorReport.updateMany({ where: { wordId: loser.id }, data: { wordId: keeper.id } })
        await tx.word.delete({ where: { id: loser.id } })
      }
      await tx.word.update({
        where: { id: keeper.id },
        data: {
          translation,
          frequencyRank,
          ...(examples.length > 0 ? { examples: examples as never } : {}),
          ...(forms ? { forms: forms as never } : {}),
          ...(details ? { details: details as never } : {}),
        },
      })
    })
    merged++
    if (merged % 200 === 0) console.log(`  ${merged}/${duplicated.length}`)
  }

  console.log(dry ? `\n(--dry : rien n’a été écrit, ${merged} groupe(s) concernés)` : `\n${merged} groupe(s) fusionné(s)`)
  console.log('Relancez mark-studyable après coup : une glose fusionnée peut changer le verdict.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
