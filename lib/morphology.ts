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

// Irregular forms no suffix rule can reach. Values are headwords in the vocabulary.
const SV_IRREGULARS: Record<string, string> = {
  vuxit: 'växa', vuxen: 'växa',
  gjord: 'göra',
  äldre: 'gammal', äldst: 'gammal', äldsta: 'gammal',
  la: 'lägga',
  avbrutet: 'avbryta', avbruten: 'avbryta',
  mysteriet: 'mysterium',
}

// Tried in order on unmatched tokens (longest first)
const SV_STRIP_SUFFIXES = [
  'ernas', 'arnas', 'ornas', 'erna', 'arna', 'orna', 'ande', 'ende', 'ades',
  'ens', 'ets', 'ade', 'dde', 'en', 'et', 'tt', 'ts', 'ar', 'er', 'or', 'na',
  'ad', 'de', 'te', 'n', 't', 'd', 's', 'a', 'e',
]

const SV_VERB_SUFFIXES = new Set(['ade', 'dde', 'de', 'te'])
const VOWELS = 'aeiouyåäö'

function swedishCandidates(token: string): string[] {
  const out: string[] = []
  if (SV_IRREGULARS[token]) out.push(SV_IRREGULARS[token])
  // Imperatives are the bare verb stem: "drick!" → "dricka", "lägg" → "lägga"
  out.push(token + 'a')
  for (const suffix of SV_STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    // Single-letter stems are noise, except the vowel words ("ön" → "ö", "ån" → "å")
    if (stem.length < 2 && !(stem.length === 1 && VOWELS.includes(stem))) continue
    // Verb endings: rebuild the infinitive first ("väntade" → "vänta", not the homograph "vänt")
    out.push(...(SV_VERB_SUFFIXES.has(suffix) ? [stem + 'a', stem, stem + 'e'] : [stem, stem + 'a', stem + 'e']))
    // Deponent verbs: "envisades" → "envisas", "synts" → "synas"
    if (suffix === 'ades' || suffix === 'ts') out.push(stem + 'as')
    // Neuter forms: "eget" → "egen", "oavgjort" → "oavgjord"
    if (suffix === 't' || suffix === 'tt') out.push(stem + 'n', stem + 'd')
    // Neuter participle → common gender: "instucket" → "instucken"
    if (suffix === 'et') out.push(stem + 'en')
    // Redouble final consonant: "sant" → "san" → "sann", "tunt" → "tun" → "tunn"
    if (stem.length >= 2) out.push(stem + stem[stem.length - 1], stem + stem[stem.length - 1] + 'n')
    // Undouble final consonant: "rummet" → "rumm" → "rum", "mannen" → "mann" → "man"
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      const single = stem.slice(0, -1)
      out.push(single, single + 'a')
    }
    // Syncope: the lemma's unstressed vowel drops before a definite ending —
    // "fönstret" → "fönstr" → "fönster", "himlen" → "himl" → "himmel",
    // "gamla" → "gaml" → "gammal". Try reinserting e/a, with and without
    // redoubling the consonant before it.
    if (stem.length >= 3 && !VOWELS.includes(stem[stem.length - 1])) {
      const body = stem.slice(0, -1)
      const last = stem[stem.length - 1]
      for (const vowel of ['e', 'a']) {
        out.push(body + vowel + last)
        if (body.length >= 2) out.push(body + body[body.length - 1] + vowel + last)
      }
    }
  }
  return out
}

// Irregular finite forms that no suffix rule can reach, and the frequent
// contractions as they arrive from the reader (apostrophes already stripped).
// Values are headwords present in the vocabulary.
const EN_IRREGULARS: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', having: 'have',
  does: 'do',
  went: 'go', gone: 'go', goes: 'go',
  cannot: 'can', cant: 'can', wont: 'will',
  dont: 'do', doesnt: 'do', didnt: 'do',
  isnt: 'be', arent: 'be', wasnt: 'be', werent: 'be',
  im: 'be', youre: 'be', hes: 'be', shes: 'be', theyre: 'be', whats: 'what',
  thats: 'that', theres: 'there', lets: 'let',
  havent: 'have', hasnt: 'have', hadnt: 'have',
  shouldnt: 'should', wouldnt: 'would', couldnt: 'could', mustnt: 'must',
  ive: 'have', youve: 'have', weve: 'have', theyve: 'have',
  oclock: 'hour',
}

// "i"-prefixed endings restore a "y" stem ("studies" → "study", "tried" → "try")
const EN_STRIP_SUFFIXES = [
  'iest', 'ies', 'ied', 'ier', 'est', 'ing', 'ed', 'es', 'er', 'ly', 's', 'd',
]

function englishCandidates(token: string): string[] {
  const out: string[] = []
  if (EN_IRREGULARS[token]) out.push(EN_IRREGULARS[token])
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
