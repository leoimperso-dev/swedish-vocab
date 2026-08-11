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

// Dutch irregular finite forms — vowel changes no suffix rule can rebuild.
// Values are headwords in the vocabulary. Regular forms go through the rules.
const NL_IRREGULARS: Record<string, string> = {
  ben: 'zijn', bent: 'zijn', is: 'zijn', was: 'zijn', waren: 'zijn', geweest: 'zijn',
  heb: 'hebben', hebt: 'hebben', heeft: 'hebben', had: 'hebben', hadden: 'hebben',
  kan: 'kunnen', kun: 'kunnen', kunt: 'kunnen', kon: 'kunnen', konden: 'kunnen',
  zal: 'zullen', zul: 'zullen', zult: 'zullen', zou: 'zullen', zouden: 'zullen',
  mag: 'mogen', mocht: 'mogen', mochten: 'mogen',
  wil: 'willen', wou: 'willen',
  ging: 'gaan', gingen: 'gaan', gegaan: 'gaan',
  kwam: 'komen', kwamen: 'komen', gekomen: 'komen',
  deed: 'doen', deden: 'doen', gedaan: 'doen',
  zag: 'zien', zagen: 'zien', gezien: 'zien',
  stond: 'staan', stonden: 'staan', gestaan: 'staan',
  at: 'eten', aten: 'eten', gegeten: 'eten',
  gaf: 'geven', gaven: 'geven',
  nam: 'nemen', namen: 'nemen',
  wist: 'weten', wisten: 'weten',
  werd: 'worden', werden: 'worden', geworden: 'worden',
  zei: 'zeggen', zeiden: 'zeggen',
  eet: 'eten', gaat: 'gaan', hou: 'houden',
  stak: 'steken', staken: 'steken',
  klonk: 'klinken', klonken: 'klinken',
  schrok: 'schrikken', schrokken: 'schrikken',
  gestolen: 'stelen', stal: 'stelen', stalen: 'stelen',
  geslopen: 'sluipen', sloop: 'sluipen',
  sloeg: 'slaan', sloegen: 'slaan', geslagen: 'slaan',
  hing: 'hangen', hingen: 'hangen', gehangen: 'hangen',
  keek: 'kijken', keken: 'kijken',
  liep: 'lopen', liepen: 'lopen',
  vond: 'vinden', vonden: 'vinden',
  dacht: 'denken', dachten: 'denken',
  kocht: 'kopen', kochten: 'kopen',
  bracht: 'brengen', brachten: 'brengen',
  zocht: 'zoeken', zochten: 'zoeken',
  hield: 'houden', hielden: 'houden',
  liet: 'laten', lieten: 'laten',
  sliep: 'slapen', sliepen: 'slapen',
  droeg: 'dragen', droegen: 'dragen',
  vroeg: 'vragen', vroegen: 'vragen',
  bleef: 'blijven', bleven: 'blijven', gebleven: 'blijven',
  schreef: 'schrijven', schreven: 'schrijven', geschreven: 'schrijven',
  begon: 'beginnen', begonnen: 'beginnen',
  dronk: 'drinken', dronken: 'drinken', gedronken: 'drinken',
  zat: 'zitten', zaten: 'zitten', gezeten: 'zitten',
  lag: 'liggen', lagen: 'liggen', gelegen: 'liggen',
}

// Tried in order (longest first): diminutives (and their plurals), verb
// endings, plurals/infinitives
const NL_STRIP_SUFFIXES = [
  'etjes', 'tjes', 'pjes', 'jes', 'etje', 'tje', 'pje', 'je',
  'den', 'ten', 'end', 'en', 'de', 'te', 's', 't', 'd', 'e',
]

// Rebuild a Dutch stem's spelling variants. Open/closed syllable spelling moves
// both ways ("loop" ↔ "lop-", "hog-" ↔ "hoog"), and final consonants devoice
// ("huiz-" ↔ "huis", "geev-" ↔ "geef") — combinations included ("raas" → "raz-").
function dutchStemVariants(stem: string): string[] {
  const out = new Set<string>([stem])
  const doubled = stem.match(/^(.*?)([aeou])\2([bcdfgklmnprstvz])$/)
  // "loop" → "lop", "geef" → "gef"
  if (doubled) out.add(doubled[1] + doubled[2] + doubled[3])
  // "hog" → "hoog", "rod" → "rood" (rebuild the long vowel)
  const single = stem.match(/^(.+?)([aeou])([bcdfgklmnprstvz])$/)
  if (single && single[1] && !'aeiou'.includes(single[1][single[1].length - 1])) {
    out.add(single[1] + single[2] + single[2] + single[3])
  }
  // Voicing alternations, applied to every variant gathered so far
  for (const v of [...out]) {
    const last = v[v.length - 1]
    if (last === 'z') out.add(v.slice(0, -1) + 's')
    if (last === 'v') out.add(v.slice(0, -1) + 'f')
    if (last === 's') out.add(v.slice(0, -1) + 'z')
    if (last === 'f') out.add(v.slice(0, -1) + 'v')
  }
  return [...out]
}

// Infinitive guesses for a verb stem: "kom" → "komen", "zeg" → "zeggen",
// "zwaai" → "zwaaien", "gaa" → "gaan"
function infinitivesOf(stem: string): string[] {
  const out: string[] = []
  for (const variant of dutchStemVariants(stem)) {
    out.push(variant, variant + 'en', variant + 'e')
    const last = variant[variant.length - 1]
    if ('bcdfgklmnprstz'.includes(last)) out.push(variant + last + 'en')
    if ('aeiou'.includes(last)) out.push(variant + 'n')
  }
  return out
}

function dutchCandidates(token: string): string[] {
  const out: string[] = []
  if (NL_IRREGULARS[token]) out.push(NL_IRREGULARS[token])
  // Bare stem is the 1st person / imperative: "ik kom", "praat!", "denk na"
  out.push(...infinitivesOf(token))
  // Regular past participle: ge + stem + t/d ("gewerkt" → "werken")
  if (token.startsWith('ge') && token.length >= 5) {
    out.push(...infinitivesOf(token.slice(2).replace(/[td]$/, '')))
  }
  for (const suffix of NL_STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length < 2) continue
    out.push(...infinitivesOf(stem))
    // Undouble the plural's consonant: "gesprekken" → "gesprekk" → "gesprek"
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.push(stem.slice(0, -1))
    }
  }
  return out
}

// Ordered lemma guesses for a token, best first. Callers stop at the first hit.
export function lemmaCandidates(token: string, lang: Lang): string[] {
  if (lang === 'sv') return swedishCandidates(token)
  if (lang === 'en') return englishCandidates(token)
  if (lang === 'nl') return dutchCandidates(token)
  return []
}

// Strips the article/infinitive marker a headword may carry ("en kvinna", "att gå", "to go")
const HEADWORD_PREFIX: Partial<Record<Lang, RegExp>> = {
  sv: /^(en|ett|att)\s+/,
  en: /^to\s+/,
  nl: /^(de|het)\s+/,
}

export function headwordKey(raw: string, lang: Lang): string {
  const base = raw.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
  const prefix = HEADWORD_PREFIX[lang]
  return prefix ? base.replace(prefix, '') : base
}
