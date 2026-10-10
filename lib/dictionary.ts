// In-memory term → translation dictionary built from the Word table, one cache
// per language pair. Looks up any surface form: headwords, stored inflections,
// then the language's suffix stripping rules (lib/morphology.ts).
import { db } from '@/lib/db'
import { parseDetails } from '@/lib/word-display'
import { headwordKey, isDerivationalTail, isSuffixShorthand, lemmaCandidates } from '@/lib/morphology'
import { pairOf, type Lang, type PairId } from '@/lib/courses'
import { DICTIONARY_OVERRIDES } from '@/lib/dictionary-overrides'

export interface DictEntry {
  id: string // the Word row, so the popover can star it
  term: string // display headword ("en kvinna")
  translation: string // best translation(s)
  forms: string | null
  /**
   * Other words the same surface form could be.
   *
   * Swedish definite forms collide with real headwords: "banan" is both a
   * banana and *the course* (definite of "bana"). The exact match wins, which
   * answered "une banane" in a text about a golf course. Nothing in the token
   * can settle it — only the sentence can — so the reader is shown the
   * alternative instead of being told one answer with false confidence.
   */
  also?: Array<{ term: string; translation: string }>
}

interface Dict {
  /** Surface key -> the entry shown first (most frequent claimant). */
  primary: Map<string, DictEntry>
  /** Surface key -> every claimant, so a homograph can be offered as well. */
  all: Map<string, DictEntry[]>
  /** Surface keys pinned by DICTIONARY_OVERRIDES. */
  overridden: Set<string>
}

const caches = new Map<PairId, Dict>()

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

async function buildCache(pair: PairId): Promise<Dict> {
  const lang = pairOf(pair).term
  const words = await db.word.findMany({
    where: { pair },
    select: { id: true, term: true, translation: true, forms: true, details: true, frequencyRank: true, wordType: true },
    // Common words win when several entries share a surface form
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })

  const primary = new Map<string, DictEntry>()
  const all = new Map<string, DictEntry[]>()
  const byHeadword = new Map<string, Array<{ entry: DictEntry; wordType: string }>>()
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

    const headword = headwordKey(word.term, lang)
    byHeadword.set(headword, [...(byHeadword.get(headword) ?? []), { entry, wordType: word.wordType }])
    const keys = new Set<string>([headword])
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
      if (!key) continue
      if (!primary.has(key)) primary.set(key, entry)
      all.set(key, [...(all.get(key) ?? []), entry])
    }
  }

  // Pinned readings beat both the exact match and the morphology
  const overridden = new Set<string>()
  for (const [token, target] of Object.entries(DICTIONARY_OVERRIDES[pair] ?? {})) {
    const [headword, wordType] = target.split(':')
    const match = byHeadword.get(headword)?.find(c => !wordType || c.wordType === wordType)
    if (!match) continue // the headword was removed or renamed: fall back to the automatic reading
    primary.set(token, match.entry)
    all.set(token, [match.entry, ...(all.get(token) ?? []).filter(e => e.id !== match.entry.id)])
    overridden.add(token)
  }
  return { primary, all, overridden }
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

/** Entries reachable from a token by the morphology, minus the one already shown. */
function otherReadings(
  dict: Dict,
  token: string,
  lang: Lang,
  chosen: DictEntry,
): Array<{ term: string; translation: string }> {
  const seen = new Set([chosen.id])
  const out: Array<{ term: string; translation: string }> = []
  // The token itself first — several words can share one spelling — then what
  // the morphology reaches from it
  for (const candidate of [token, ...lemmaCandidates(token, lang)]) {
    for (const hit of dict.all.get(candidate) ?? []) {
      if (seen.has(hit.id)) continue
      seen.add(hit.id)
      out.push({ term: hit.term, translation: hit.translation })
      if (out.length === 2) return out
    }
  }
  return out
}

/**
 * `properNoun`: the reader saw the word capitalised mid-sentence. Names collide
 * with common words ("Ana" read as "ano", "Molly" as MDMA), so only a pinned
 * reading or a headword that is itself capitalised ("England", "la Navidad")
 * may answer — anything else is a name the dictionary does not know.
 */
export async function lookupWord(raw: string, pair: PairId, { properNoun = false } = {}): Promise<DictEntry | null> {
  let dict = caches.get(pair)
  if (!dict) {
    dict = await buildCache(pair)
    caches.set(pair, dict)
  }
  const cache = dict.primary

  const token = raw.toLowerCase().replace(/[.,!?¿¡;:"«»()[\]…'’„“”–—]/g, '').trim()
  if (!token) return null

  if (properNoun) {
    const direct = cache.get(token)
    return direct && (dict.overridden.has(token) || direct.term !== direct.term.toLowerCase()) ? direct : null
  }

  const lang = pairOf(pair).term
  const hit = resolve(cache, token, lang) ?? resolveCompound(cache, token, lang)
  if (hit) {
    const also = otherReadings(dict, token, lang, hit)
    return also.length > 0 ? { ...hit, also } : hit
  }

  // Hyphenated compounds ("thirty-one", "band-sidan"): surface the first known part
  if (token.includes('-')) {
    for (const part of token.split('-')) {
      const partHit = part.length >= 1 ? resolve(cache, part, lang) : null
      if (partHit) return partHit
    }
  }
  return null
}
