// Turns a bilingual text into example sentences for the rare words it contains.
//
// Tatoeba is thin exactly where it hurts: an advanced word often has no
// sentence at all, or an untranslated one. A real bilingual document —
// regulations, an article, a manual — is full of them, already translated by a
// human, and in a register no corpus of everyday chit-chat provides.
//
// Only words that need it are touched: those the corpus ranks at RARE_RANK or
// beyond and that hold fewer than MAX_EXAMPLES translated sentences. A common
// word already has better and shorter examples. An *unranked* word is not
// treated as rare — most are unranked because the corpus never saw that exact
// spelling, not because they are unusual ("inte", "som", "att hjälpa"), and
// hanging regulations off them teaches nobody anything.
//
// Usage:
//   pnpm tsx scripts/harvest-examples.ts <term.txt> <translation.txt> [pair] [--dry]
//
// Both files: paragraphs separated by a blank line, aligned one for one. A
// paragraph whose two sides disagree on sentence count is kept whole, so a
// sentence is never paired with the translation of its neighbour.
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'
import { asPairId, pairOf, type Lang } from '../lib/courses'
import { headwordKey, isSuffixShorthand } from '../lib/morphology'

interface Example {
  term: string
  translation?: string
  blank: string
  manual?: boolean
}

/** At or beyond this corpus rank a word is rare enough to be starved of sentences. */
const RARE_RANK = 4000
const MAX_EXAMPLES = 3
// A sentence that illustrates half the dictionary illustrates nothing
const MAX_WORDS_PER_SENTENCE = 4
// Long enough to be worth reading, short enough to stay an example
const MIN_TOKENS = 4
const MAX_TOKENS = 30

function paragraphs(file: string): string[] {
  return fs.readFileSync(file, 'utf-8')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map(p => p.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
}

function sentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?…])\s+(?=[^\s])/).map(s => s.trim()).filter(Boolean)
}

/** Sentence pairs, falling back to whole paragraphs when the split disagrees. */
function alignedPairs(termFile: string, translationFile: string): Array<[string, string]> {
  const left = paragraphs(termFile)
  const right = paragraphs(translationFile)
  if (left.length !== right.length) {
    console.error(`Paragraphes désalignés : ${left.length} vs ${right.length}`)
    process.exit(1)
  }
  const pairs: Array<[string, string]> = []
  left.forEach((paragraph, i) => {
    const a = sentences(paragraph)
    const b = sentences(right[i])
    if (a.length === b.length) a.forEach((sentence, j) => pairs.push([sentence, b[j]]))
    else pairs.push([paragraph, right[i]])
  })
  return pairs
}

function normalize(token: string): string {
  return token.toLowerCase().replace(/[.,!?;:"«»()[\]…'’—–-]/g, '')
}

async function main() {
  const [termFile, translationFile, pairArg] = process.argv.slice(2)
  const dry = process.argv.includes('--dry')
  if (!termFile || !translationFile) {
    console.error('usage: pnpm tsx scripts/harvest-examples.ts <term.txt> <translation.txt> [pair] [--dry]')
    process.exit(1)
  }
  const pair = asPairId(pairArg)
  const lang: Lang = pairOf(pair).term

  const words = await db.word.findMany({
    where: { pair },
    select: { id: true, term: true, translation: true, forms: true, frequencyRank: true, examples: true },
  })

  // Surface key -> the rare words that claim it. Ambiguity is left in: a
  // sentence attached to the wrong homograph is visible in the vocabulary list
  // and removable, unlike a rank, which silently reshapes what is taught.
  const byKey = new Map<string, typeof words>()
  for (const word of words) {
    if (word.frequencyRank === null || word.frequencyRank < RARE_RANK) continue
    const translated = ((word.examples ?? []) as unknown as Example[]).filter(e => e.translation)
    if (translated.length >= MAX_EXAMPLES) continue

    const keys = new Set<string>()
    const base = headwordKey(word.term, lang)
    if (base && !base.includes(' ')) keys.add(base)
    if (word.forms && typeof word.forms === 'object') {
      for (const form of Object.values(word.forms as Record<string, unknown>)) {
        if (typeof form !== 'string') continue
        const clean = form.toLowerCase().trim()
        if (clean.length >= 3 && !clean.includes(' ') && !isSuffixShorthand(clean, lang)) keys.add(clean)
      }
    }
    for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), word])
  }
  console.log(`${byKey.size} clé(s) de mots rares en manque d'exemples, sur ${words.length} mots`)

  const additions = new Map<string, Example[]>()
  for (const [sentence, translation] of alignedPairs(termFile, translationFile)) {
    const tokens = sentence.split(/\s+/)
    if (tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS) continue

    const hits: Array<{ word: (typeof words)[number]; blank: string }> = []
    const seen = new Set<string>()
    for (const raw of tokens) {
      const token = normalize(raw)
      if (token.length < 3) continue
      for (const candidate of [token, headwordKey(token, lang)]) {
        for (const word of byKey.get(candidate) ?? []) {
          if (seen.has(word.id)) continue
          seen.add(word.id)
          hits.push({ word, blank: token })
        }
      }
    }
    if (hits.length === 0) continue
    // A dense sentence is the valuable one, not the one to throw away: it goes
    // to the words that need it most, rarest first.
    hits.sort((a, b) => (b.word.frequencyRank ?? 0) - (a.word.frequencyRank ?? 0))

    for (const { word, blank } of hits.slice(0, MAX_WORDS_PER_SENTENCE)) {
      const list = additions.get(word.id) ?? []
      list.push({ term: sentence, translation, blank, manual: true })
      additions.set(word.id, list)
      console.log(`  ${word.term} (rang ${word.frequencyRank ?? '-'}) ← "${blank}"`)
    }
  }

  console.log(`\n${additions.size} mot(s) recevraient une phrase`)
  if (dry) { console.log('(--dry : rien n’a été écrit)'); process.exit(0) }

  for (const [wordId, added] of additions) {
    const word = words.find(w => w.id === wordId)!
    const existing = ((word.examples ?? []) as unknown as Example[])
    const fresh = added.filter(a => !existing.some(e => e.term === a.term))
    if (fresh.length === 0) continue
    await db.word.update({
      where: { id: wordId },
      data: { examples: [...fresh, ...existing] as never },
    })
  }
  console.log('écrit')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
