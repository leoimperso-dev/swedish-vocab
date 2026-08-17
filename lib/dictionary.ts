// In-memory term → translation dictionary built from the Word table, one cache
// per language pair. Looks up any surface form: headwords, stored inflections,
// then the language's suffix stripping rules (lib/morphology.ts).
import { db } from '@/lib/db'
import { parseDetails } from '@/lib/word-display'
import { headwordKey, isDerivationalTail, isSuffixShorthand, lemmaCandidates } from '@/lib/morphology'
import { pairOf, type Lang, type PairId } from '@/lib/courses'

export interface DictEntry {
  id: string // the Word row, so the popover can star it
  term: string // display headword ("en kvinna")
  translation: string // best translation(s)
  forms: string | null
}

const caches = new Map<PairId, Map<string, DictEntry>>()

// How many senses a popover shows before it stops being a translation and
// starts being a dictionary article
const MAX_SENSES = 3

/**
 * The senses worth showing, in order. `details.translations` is merged from
 * several sources, so it repeats itself ("solitude, isolement, solitude") and
 * sometimes carries a definition rather than a translation ("qualité de ce qui
 * est beau"). Both read as errors to a learner glancing at a popover.
 */
function bestSenses(translations: string[], fallback: string): string {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const raw of translations) {
    const sense = raw.trim()
    const key = sense.toLowerCase()
    if (!sense || seen.has(key)) continue
    seen.add(key)
    // A definition explains, a translation names — "qui", "ce qui" and length
    // are what separates the two here
    if (sense.length > 34 || /\b(qui|dont|lorsqu|celui|celle)\b/.test(key)) continue
    kept.push(sense)
    if (kept.length === MAX_SENSES) break
  }
  return kept.length > 0 ? kept.join(', ') : fallback
}

async function buildCache(pair: PairId): Promise<Map<string, DictEntry>> {
  const lang = pairOf(pair).term
  const words = await db.word.findMany({
    where: { pair },
    select: { id: true, term: true, translation: true, forms: true, details: true, frequencyRank: true },
    // Common words win when several entries share a surface form
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })

  const map = new Map<string, DictEntry>()
  const formOrder = [
    'present', 'preterit', 'supine',
    'past', 'pastParticiple',
    'plural', 'ett', 'comparative', 'superlative',
  ]

  for (const word of words) {
    const details = parseDetails(word.details)
    const formsRecord = word.forms && typeof word.forms === 'object' ? word.forms as Record<string, string> : null
    const entry: DictEntry = {
      id: word.id,
      term: word.term.replace(/\(.*?\)/g, '').trim(),
      // The stored gloss is noisy the same way an enriched one is — the bulk
      // import merged senses and sometimes kept a definition
      translation: bestSenses(
        details?.translations ?? word.translation.split(','),
        word.translation,
      ),
      forms: formsRecord
        ? formOrder.filter(k => formsRecord[k]).map(k => formsRecord[k]).join(', ') || null
        : null,
    }

    const keys = new Set<string>([headwordKey(word.term, lang)])
    if (formsRecord) {
      for (const v of Object.values(formsRecord)) {
        if (typeof v === 'string') {
          const form = v.toLowerCase().trim()
          // >= 2, not 3: "är" and "sa" are real, very frequent stored forms.
          // Bare-ending shorthands from the personal file are filtered separately.
          if (form.length >= 2 && !isSuffixShorthand(form, lang)) keys.add(form)
        }
      }
    }
    for (const key of keys) {
      if (key && !map.has(key)) map.set(key, entry)
    }
  }
  return map
}

function resolve(cache: Map<string, DictEntry>, token: string, lang: Lang): DictEntry | null {
  const direct = cache.get(token)
  if (direct) return direct
  for (const candidate of lemmaCandidates(token, lang)) {
    const hit = cache.get(candidate)
    if (hit) return hit
  }
  return null
}

// Swedish compounds are open-ended ("köksbordet", "konferensrummet"): when both
// halves are known, surface the head — "köksbordet" resolves to "ett bord".
// Longest head wins, and both sides must be real entries so junk stays unmatched.
// Recursion covers stacked compounds ("hundratrettiotvå", "femhundrakronorssedel").
// Dutch composes the same way ("keukentafel").
function resolveCompound(cache: Map<string, DictEntry>, token: string, lang: Lang, depth = 0): DictEntry | null {
  if ((lang !== 'sv' && lang !== 'nl') || token.length < 6 || depth > 2) return null
  // Prefixes down to 2 letters: real short words compose too ("urverk", "elbolag")
  for (let i = token.length - 3; i >= 2; i--) {
    let prefix = token.slice(0, i)
    // Linking -s- : "arbetstimmar" = arbete+s+timmar
    if (prefix.endsWith('s') && !cache.has(prefix)) prefix = prefix.slice(0, -1)
    // The prefix may drop the lemma's final vowel ("samhälls-" for "samhälle")
    // or be an inflected form itself ("kronor" of "krona") — full resolve last
    if (
      !cache.has(prefix) && !cache.has(prefix + 'a') && !cache.has(prefix + 'e') &&
      !resolve(cache, prefix, lang)
    ) continue
    const rest = token.slice(i)
    // "kortademig" + "heid" is a derivation, not a compound: its head is a
    // suffix, and answering with whatever that suffix resolves to is nonsense
    if (isDerivationalTail(rest, lang)) continue
    const head = resolve(cache, rest, lang) ?? resolveCompound(cache, rest, lang, depth + 1)
    if (head) return head
  }
  return null
}

export async function lookupWord(raw: string, pair: PairId): Promise<DictEntry | null> {
  let cache = caches.get(pair)
  if (!cache) {
    cache = await buildCache(pair)
    caches.set(pair, cache)
  }

  const token = raw.toLowerCase().replace(/[.,!?¿¡;:"«»()[\]…'’„“”–—]/g, '').trim()
  if (!token) return null

  const lang = pairOf(pair).term
  const hit = resolve(cache, token, lang) ?? resolveCompound(cache, token, lang)
  if (hit) return hit

  // Hyphenated compounds ("thirty-one", "band-sidan"): surface the first known part
  if (token.includes('-')) {
    for (const part of token.split('-')) {
      const partHit = part.length >= 1 ? resolve(cache, part, lang) : null
      if (partHit) return partHit
    }
  }
  return null
}
