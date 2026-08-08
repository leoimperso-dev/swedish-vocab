// Surface form -> headword derivation, per learned language.
// Used to look up an inflected word found in a text (reading, Tatoeba matching)
// against a dictionary keyed by headwords and stored inflections.
import type { Lang } from '@/lib/courses'

// Swedish personal vocabulary files often note inflections as bare endings
// ("ar", "ade") rather than real words — those must never become lookup keys.
const SV_SHORTHANDS = new Set([
  'r', 'ar', 'er', 'a', 'de', 'ade', 'dde', 'te', 't', 'at', 'tt', 'it',
  'en', 'n', 'na', 'are', 'ast', 'aste',
])

export function isSuffixShorthand(form: string, lang: Lang): boolean {
  return lang === 'sv' && SV_SHORTHANDS.has(form)
}

// Tried in order on unmatched tokens (longest first)
const SV_STRIP_SUFFIXES = [
  'ernas', 'arnas', 'ornas', 'erna', 'arna', 'orna', 'ens', 'ets', 'ade', 'dde',
  'en', 'et', 'ar', 'er', 'or', 'na', 'de', 'te', 'n', 't', 's', 'a',
]

const SV_VERB_SUFFIXES = new Set(['ade', 'dde', 'de', 'te'])

function swedishCandidates(token: string): string[] {
  const out: string[] = []
  for (const suffix of SV_STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length < 2) continue
    // Verb endings: rebuild the infinitive first ("väntade" → "vänta", not the homograph "vänt")
    out.push(...(SV_VERB_SUFFIXES.has(suffix) ? [stem + 'a', stem, stem + 'e'] : [stem, stem + 'a', stem + 'e']))
    // Undouble final consonant: "rummet" → "rumm" → "rum", "mannen" → "mann" → "man"
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      const single = stem.slice(0, -1)
      out.push(single, single + 'a')
    }
  }
  return out
}

// "i"-prefixed endings restore a "y" stem ("studies" → "study", "tried" → "try")
const EN_STRIP_SUFFIXES = [
  'iest', 'ies', 'ied', 'ier', 'est', 'ing', 'ed', 'es', 'er', 'ly', 's', 'd',
]

function englishCandidates(token: string): string[] {
  const out: string[] = []
  for (const suffix of EN_STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length < 2) continue
    if (suffix.startsWith('i')) out.push(stem + 'y')
    // Bare stem, then a dropped silent "e" ("hoping" → "hope", "used" → "use")
    out.push(stem, stem + 'e')
    // Undouble final consonant: "stopped" → "stopp" → "stop", "running" → "runn" → "run"
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      const single = stem.slice(0, -1)
      out.push(single, single + 'e')
    }
  }
  return out
}

// Ordered lemma guesses for a token, best first. Callers stop at the first hit.
export function lemmaCandidates(token: string, lang: Lang): string[] {
  if (lang === 'sv') return swedishCandidates(token)
  if (lang === 'en') return englishCandidates(token)
  return []
}

// Strips the article/infinitive marker a headword may carry ("en kvinna", "att gå", "to go")
const HEADWORD_PREFIX: Partial<Record<Lang, RegExp>> = {
  sv: /^(en|ett|att)\s+/,
  en: /^to\s+/,
}

export function headwordKey(raw: string, lang: Lang): string {
  const base = raw.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
  const prefix = HEADWORD_PREFIX[lang]
  return prefix ? base.replace(prefix, '') : base
}
