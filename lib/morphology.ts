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

// Same idea as NL_DERIVATIONS: "möjlighet" is "möjlig" turned into a noun,
// "läsning" is "läsa" turned into one.
const SV_DERIVATIONS: Array<[suffix: string, base: (stem: string) => string[]]> = [
  ['heten', stem => [stem + 'het', stem]],
  ['heter', stem => [stem + 'het', stem]],
  ['het', stem => [stem]],
  ['ningar', stem => [stem + 'a', stem]],
  ['ning', stem => [stem + 'a', stem]],
  ['skap', stem => [stem]],
  ['löst', stem => [stem + 'lös']],
]

function swedishCandidates(token: string): string[] {
  const out: string[] = []
  if (SV_IRREGULARS[token]) out.push(SV_IRREGULARS[token])
  for (const [suffix, base] of SV_DERIVATIONS) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length >= 3) out.push(...base(stem))
  }
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
    // Redouble final consonant: "sant" → "san" → "sann", "tunt" → "tun" → "tunn",
    // and with the infinitive ending for the s-passive: "bestäms" → "bestäm" →
    // "bestämma". Swedish builds that passive on the present stem, so stripping
    // the -s leaves a stem one consonant short of its own infinitive.
    if (stem.length >= 2) {
      const doubled = stem + stem[stem.length - 1]
      out.push(doubled, doubled + 'n', doubled + 'a')
    }
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

// Suffixes that derive a new word rather than inflect one: "kortademigheid" is
// "kortademig" turned into a noun, "wandeling" is "wandelen" turned into one.
// The vocabulary rarely carries the derived form, so the base is the answer.
const NL_DERIVATIONS: Array<[suffix: string, base: (stem: string) => string[]]> = [
  ['heden', stem => [stem + 'heid', stem]],
  ['heid', stem => [stem]],
  ['ingen', stem => infinitivesOf(stem)],
  ['ing', stem => infinitivesOf(stem)],
  ['schap', stem => [stem]],
  ['loze', stem => [stem + 'loos']],
  ['baar', stem => [stem, ...infinitivesOf(stem)]],
  ['lijk', stem => [stem]],
  ['achtig', stem => [stem]],
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
  // Before anything else: a derived word points at its base, not at whatever a
  // blind split makes of its suffix
  for (const [suffix, base] of NL_DERIVATIONS) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length >= 3) out.push(...base(stem))
  }
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

// Spanish suppletive forms no rule can rebuild. Values are vocabulary headwords.
const ES_IRREGULARS: Record<string, string> = {
  soy: 'ser', eres: 'ser', es: 'ser', somos: 'ser', sois: 'ser', son: 'ser',
  era: 'ser', eras: 'ser', eran: 'ser', éramos: 'ser',
  fue: 'ser', fui: 'ser', fuiste: 'ser', fuimos: 'ser', fueron: 'ser', fuera: 'ser', fuese: 'ser',
  sido: 'ser', sea: 'ser', sean: 'ser', seas: 'ser',
  estoy: 'estar', estuve: 'estar', estuvo: 'estar', estuvieron: 'estar', estuviera: 'estar',
  voy: 'ir', vas: 'ir', va: 'ir', vamos: 'ir', vais: 'ir', van: 'ir',
  iba: 'ir', ibas: 'ir', iban: 'ir', íbamos: 'ir', ido: 'ir', vaya: 'ir', ve: 'ir',
  he: 'haber', has: 'haber', ha: 'haber', hemos: 'haber', habéis: 'haber', han: 'haber',
  hay: 'haber', había: 'haber', hubo: 'haber', habido: 'haber', haya: 'haber', habrá: 'haber',
  tengo: 'tener', tuve: 'tener', tuvo: 'tener', tuvieron: 'tener', tenga: 'tener', ten: 'tener',
  hago: 'hacer', hice: 'hacer', hizo: 'hacer', hicieron: 'hacer', hecho: 'hacer',
  haga: 'hacer', haz: 'hacer', haría: 'hacer', hará: 'hacer', haré: 'hacer',
  digo: 'decir', dije: 'decir', dijo: 'decir', dijeron: 'decir', dicho: 'decir',
  diga: 'decir', di: 'decir', dirá: 'decir', diría: 'decir',
  puedo: 'poder', pude: 'poder', pudo: 'poder', pudieron: 'poder', pueda: 'poder',
  podrá: 'poder', podría: 'poder',
  quise: 'querer', quiso: 'querer', quisieron: 'querer', quiera: 'querer',
  querrá: 'querer', querría: 'querer', quisiera: 'querer',
  sé: 'saber', supe: 'saber', supo: 'saber', supieron: 'saber', sepa: 'saber', sabrá: 'saber',
  vengo: 'venir', vine: 'venir', vino: 'venir', vinieron: 'venir', venga: 'venir', ven: 'venir',
  vendrá: 'venir',
  doy: 'dar', dio: 'dar', dieron: 'dar', dé: 'dar', dado: 'dar',
  veo: 'ver', vi: 'ver', vio: 'ver', vieron: 'ver', visto: 'ver', vea: 'ver', veía: 'ver',
  pongo: 'poner', puse: 'poner', puso: 'poner', pusieron: 'poner', puesto: 'poner',
  ponga: 'poner', pon: 'poner', pondrá: 'poner',
  salgo: 'salir', salga: 'salir', sal: 'salir', saldrá: 'salir',
  traigo: 'traer', traje: 'traer', trajo: 'traer', trajeron: 'traer', traído: 'traer',
  caigo: 'caer', cayó: 'caer', cayeron: 'caer', caído: 'caer',
  oigo: 'oír', oye: 'oír', oyó: 'oír', oyeron: 'oír', oído: 'oír',
  muerto: 'morir', murió: 'morir', murieron: 'morir',
  vuelto: 'volver', abierto: 'abrir', escrito: 'escribir', roto: 'romper',
  supongo: 'suponer', supuesto: 'suponer',
  sabrás: 'saber', tendrá: 'tener', tendría: 'tener',
  leyó: 'leer', leyeron: 'leer', leído: 'leer',
  creyó: 'creer', creyeron: 'creer', creído: 'creer',
  durmió: 'dormir', durmieron: 'dormir', sintió: 'sentir', sintieron: 'sentir',
  pidió: 'pedir', pidieron: 'pedir', siguió: 'seguir', siguieron: 'seguir',
  consiguió: 'conseguir', prefirió: 'preferir', repitió: 'repetir',
  del: 'de', al: 'a',
  hubiera: 'haber', hubieran: 'haber', pudiera: 'poder', pudieran: 'poder',
  propusiera: 'proponer', hiciera: 'hacer', hicieran: 'hacer',
  diera: 'dar', dieran: 'dar',
  siga: 'seguir', sigan: 'seguir', sigue: 'seguir',
  vemos: 'ver', ves: 'ver',
  sonríe: 'sonreír', sonrió: 'sonreír', sonriera: 'sonreír', sonriendo: 'sonreír',
  ríe: 'reír', rió: 'reír', rieron: 'reír', riendo: 'reír',
  asintió: 'asentir', asintieron: 'asentir',
  descubierto: 'descubrir', descubierta: 'descubrir',
  // One-letter stems the suffix rules refuse
  da: 'dar', das: 'dar', dan: 'dar', damos: 'dar', dais: 'dar', dad: 'dar', den: 'dar', des: 'dar',
  demos: 'dar', daba: 'dar', dabas: 'dar', daban: 'dar', dábamos: 'dar', dando: 'dar',
  diste: 'dar', dimos: 'dar',
  oí: 'oír', oíste: 'oír', oímos: 'oír', oyes: 'oír', oyen: 'oír', oía: 'oír', oías: 'oír',
  oían: 'oír', oíamos: 'oír', oyendo: 'oír', oiga: 'oír', oigan: 'oír',
  siendo: 'ser', vimos: 'ver', viste: 'ver', vayan: 'ir', vayas: 'ir', vayamos: 'ir',
  compuesto: 'componer', compuesta: 'componer', yendo: 'ir', sos: 'ser',
  // The clitic rule strips accents with the pronoun: "oírte" arrives as "oir"
  oir: 'oír', reir: 'reír', sonreir: 'sonreír', freir: 'freír',
  // Imperatives losing their accent before a clitic: "mantente", "deshazte", "vámonos"
  manten: 'mantener', deten: 'detener', obten: 'obtener', sosten: 'sostener', conten: 'contener',
  compon: 'componer', propon: 'proponer', supon: 'suponer', dispon: 'disponer', deshaz: 'deshacer',
  vámonos: 'ir', vamonos: 'ir',
}

// Irregular preterite and subjunctive stems: "tuvimos" → "tener", "hagas" → "hacer"
const ES_IRREGULAR_STEMS: Record<string, string> = {
  tuv: 'tener', teng: 'tener', estuv: 'estar', anduv: 'andar', hic: 'hacer', hag: 'hacer',
  pud: 'poder', pus: 'poner', pong: 'poner', sup: 'saber', sep: 'saber', quis: 'querer',
  vin: 'venir', veng: 'venir', dij: 'decir', dig: 'decir', traj: 'traer', traig: 'traer',
  salg: 'salir', hub: 'haber', hay: 'haber', cup: 'caber', quep: 'caber', vay: 'ir',
  fu: 'ser', oig: 'oír', caig: 'caer', duj: 'ducir',
}

// Verb endings, longest first (present, pretérito, imperfecto, futuro,
// condicional, subjunctive, gerund, participle, plural nouns)
const ES_STRIP_SUFFIXES = [
  'aríamos', 'eríamos', 'iríamos', 'iéramos', 'ábamos', 'éramos', 'íamos', 'aremos', 'eremos', 'iremos',
  'asteis', 'isteis', 'ierais', 'áramos', 'iendo', 'ieron', 'ieran', 'ieras', 'iera',
  'aban', 'abas', 'aba', 'ando', 'aron', 'aran', 'aras', 'ara', 'aría', 'ería', 'iría',
  'arías', 'erías', 'irías', 'arían', 'erían', 'irían',
  'aré', 'arás', 'ará', 'arán', 'eré', 'erás', 'erá', 'erán', 'iré', 'irás', 'irá', 'irán',
  'emos', 'amos', 'imos', 'áis', 'éis', 'ados', 'adas', 'idos', 'idas',
  'ado', 'ada', 'ido', 'ida', 'ían', 'ías', 'ía', 'ió', 'aste', 'iste',
  'an', 'en', 'as', 'es', 'a', 'e', 'o', 'ó', 'é', 'í', 'á', 'ás', 'ís', 's',
]

// Future/conditional stems of the common irregular verbs
const ES_COND_STEMS: Record<string, string> = {
  podr: 'poder', saldr: 'salir', dir: 'decir', har: 'hacer', tendr: 'tener',
  vendr: 'venir', habr: 'haber', sabr: 'saber', querr: 'querer', pondr: 'poner',
  valdr: 'valer', cabr: 'caber',
}

const ES_CLITICS = /(me|te|se|le|la|lo|nos|os|les|las|los)$/

function deaccent(s: string): string {
  return s.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
}

// Spelling changes that keep the sound before the ending
function spanishSpellingShifts(stem: string): string[] {
  const out: string[] = []
  if (stem.endsWith('qu')) out.push(stem.slice(0, -2) + 'c')
  if (stem.endsWith('gu')) out.push(stem.slice(0, -1))
  if (stem.endsWith('c')) out.push(stem.slice(0, -1) + 'z')
  if (stem.endsWith('z')) out.push(stem.slice(0, -1) + 'c')
  if (stem.endsWith('j')) out.push(stem.slice(0, -1) + 'g')
  return out
}

// Stem vowel changes of radical-changing verbs: "piens-" → "pens-", "cuelg-" → "colg-"
function spanishVowelShifts(stem: string): string[] {
  const out: string[] = []
  const ie = stem.lastIndexOf('ie')
  if (ie >= 0) out.push(stem.slice(0, ie) + 'e' + stem.slice(ie + 2))
  const ue = stem.lastIndexOf('ue')
  if (ue >= 0) out.push(stem.slice(0, ue) + 'o' + stem.slice(ue + 2))
  const i = stem.lastIndexOf('i')
  if (i >= 1) out.push(stem.slice(0, i) + 'e' + stem.slice(i + 1))
  return out
}

// Spelling/diphthong variants of a verb stem: "pued-" → "pod-", "piens-" →
// "pens-", "pid-" → "ped-", "saqu-" → "sac-", "llegu-" → "lleg-", "vec-" → "vez"
function spanishStemVariants(stem: string): string[] {
  const out = new Set<string>([stem])
  const ie = stem.lastIndexOf('ie')
  if (ie >= 0) out.add(stem.slice(0, ie) + 'e' + stem.slice(ie + 2))
  const ue = stem.lastIndexOf('ue')
  if (ue >= 0) {
    out.add(stem.slice(0, ue) + 'o' + stem.slice(ue + 2))
    out.add(stem.slice(0, ue) + 'u' + stem.slice(ue + 2))
  }
  const i = stem.lastIndexOf('i')
  if (i >= 1) out.add(stem.slice(0, i) + 'e' + stem.slice(i + 1))
  for (const variant of spanishSpellingShifts(stem)) out.add(variant)
  // "-ción" nouns lose their accent in the plural stem: "construccion(es)"
  if (stem.endsWith('ion')) out.add(stem.slice(0, -3) + 'ión')
  return [...out]
}

// "mantuv-" → "mantener", "obtendr-" → "obtener", "contraj-" → "contraer":
// prefixed verbs conjugate like their base
function spanishIrregularStem(stem: string): string | null {
  if (ES_IRREGULAR_STEMS[stem]) return ES_IRREGULAR_STEMS[stem]
  for (const table of [ES_IRREGULAR_STEMS, ES_COND_STEMS]) {
    for (const [irregular, infinitive] of Object.entries(table)) {
      if (irregular.length >= 3 && stem.length - irregular.length >= 2 && stem.endsWith(irregular)) {
        return stem.slice(0, -irregular.length) + infinitive
      }
    }
  }
  return ES_COND_STEMS[stem] ?? null
}

// Stem changes the first pass does not try: "conozc-" → "conoc-", "sig-" →
// "segu-", "durm-" → "dorm-", "incluy-" → "inclu-", accented "prohíb-" → "prohib-"
function spanishExtraStemVariants(stem: string): string[] {
  const plain = deaccent(stem)
  const bases = [stem, plain]
  if (plain.endsWith('zc')) bases.push(plain.slice(0, -2) + 'c')
  if (plain.endsWith('g')) bases.push(plain + 'u')
  if (plain.endsWith('y')) bases.push(plain.slice(0, -1))
  // Only dormir and morir turn o into u: "durmiendo", "murieron"
  if (/^(durm|mur)/.test(plain)) bases.push(plain.replace('u', 'o'))
  // A vowel change and a spelling change together: "comienc-" → "comenz-", "elij-" → "eleg-"
  const combined = bases.flatMap(base => [
    ...spanishVowelShifts(base).flatMap(spanishSpellingShifts),
    ...spanishSpellingShifts(base).flatMap(spanishVowelShifts),
  ])
  return [...new Set([...bases.flatMap(spanishStemVariants), ...combined])]
}

const ES_ACCENTED: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' }

// Plurals drop the accent of a word ending in -n/-s: "ladrones" → "ladrón",
// "japoneses" → "japonés"
function accentLastVowel(stem: string): string {
  const match = stem.match(/([aeiou])([ns])$/)
  return match ? stem.slice(0, -2) + ES_ACCENTED[match[1]] + match[2] : stem
}

function spanishCandidates(token: string, depth = 0): string[] {
  const out: string[] = []
  if (ES_IRREGULARS[token]) out.push(ES_IRREGULARS[token])
  const plain = deaccent(token)
  if (plain !== token && ES_IRREGULARS[plain]) out.push(ES_IRREGULARS[plain])
  // A plural whose singular is a headword is that word: "helados" is ice
  // creams before it is "helar", "riñas" quarrels before it is "reñir"
  if (token.length > 4 && token.endsWith('s')) out.push(token.slice(0, -1))
  // Apocopes: "buen" → "bueno", "primer" → "primero", "algún" → "alguno".
  // None ends in -s: "milagros" is not "milagroso"
  if (!token.endsWith('s')) out.push(token + 'o', token + 'a', plain + 'o', plain + 'a')
  for (const suffix of ES_STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length < 2) continue
    if (ES_COND_STEMS[stem]) out.push(ES_COND_STEMS[stem])
    for (const variant of spanishStemVariants(stem)) {
      // Infinitives (incl. reflexive), bare stem for nouns ("veces" → "vez")
      out.push(variant + 'ar', variant + 'er', variant + 'ir', variant)
      out.push(variant + 'arse', variant + 'erse', variant + 'irse')
    }
    // Feminine and plural adjectives resolve to the masculine headword:
    // "pequeña(s)" → "pequeño". After the infinitives — "trabaja" must reach
    // "trabajar" before the related noun "trabajo".
    if (suffix === 'a' || suffix === 'as') out.push(stem + 'o')
  }
  // Attached clitics: "levantarse", "dámelo", "dime" — strip up to two and retry
  if (depth < 2) {
    const m = token.match(ES_CLITICS)
    if (m && token.length - m[1].length >= 2) {
      const base = deaccent(token.slice(0, -m[1].length))
      out.push(base, base + 'se')
      out.push(...spanishCandidates(base, depth + 1))
    }
  }
  if (depth > 0) return out
  // Second pass, only reached when nothing above resolves: the token without
  // its accents ("están", "tenés", "ésta"), irregular stems and stem changes.
  // A final accent is a verb ending ("topó" is not "topo"), never dropped whole.
  if (plain !== token && plain.at(-1) === token.at(-1)) out.push(plain)
  // Plural of an irregular participle: "compuestos" → "componer"
  if (token.endsWith('s') && ES_IRREGULARS[token.slice(0, -1)]) out.push(ES_IRREGULARS[token.slice(0, -1)])
  // Without accents only where the stress sits on the stem of a verb ("confía",
  // "actúa") or a plural moved it ("jóvenes"): "célebre" is not "celebrar"
  const forms = plain !== token && (/[íú]/.test(token) || token.endsWith('es')) ? [token, plain] : [token]
  for (const form of forms) {
    for (const suffix of ['án', 'én', 'és', 'ís', 'íais', 'yendo', 'iesen', 'ieses', 'iese',
      // Preterite and -ra/-se subjunctive after "j"/"y"/"fu" stems: "construyeron", "fueran"
      'eron', 'eran', 'eras', 'era', 'ésemos', 'esen', 'eses', 'ese', 'ásemos', 'asen', 'ases', 'ase',
      ...ES_STRIP_SUFFIXES]) {
      if (!form.endsWith(suffix)) continue
      const stem = form.slice(0, -suffix.length)
      const irregular = spanishIrregularStem(stem)
      if (irregular) out.push(irregular)
      if (stem.length < 2) continue
      // A plural the first pass missed is a noun before it is a verb: "órdenes"
      if (suffix === 'es') out.push(stem, deaccent(stem), accentLastVowel(stem))
      for (const variant of spanishExtraStemVariants(stem)) {
        // "-ír" keeps its accent ("reían" → "reír"); voseo "-és" is an -er verb
        // ("creés" → "creer", not "crear")
        const endings = suffix === 'és' ? ['er', 'ar', 'ir', 'ír'] : ['ar', 'er', 'ir', 'ír']
        out.push(...endings.map(ending => variant + ending), variant)
      }
      if (suffix === 'as') out.push(stem + 'os') // "varias" → "varios"
    }
  }
  // Adverbs in -mente and superlatives in -ísimo resolve to the adjective
  const adverb = token.match(/^(.{3,})mente$/)
  if (adverb) out.push(adverb[1], adverb[1].replace(/a$/, 'o'))
  const superlative = token.match(/^(.{2,})ísim[oa]s?$/)
  if (superlative) out.push(superlative[1] + 'o', superlative[1] + 'e', superlative[1])
  return out
}

const DE_IRREGULARS: Record<string, string> = {
  // sein
  bin: 'sein', bist: 'sein', ist: 'sein', sind: 'sein', seid: 'sein',
  war: 'sein', warst: 'sein', waren: 'sein', wart: 'sein', gewesen: 'sein',
  sei: 'sein', wäre: 'sein', wären: 'sein', wärst: 'sein',
  // haben
  hast: 'haben', hat: 'haben', habt: 'haben',
  hatte: 'haben', hattest: 'haben', hatten: 'haben', hattet: 'haben', gehabt: 'haben',
  hätte: 'haben', hätten: 'haben', hättest: 'haben',
  // werden
  wirst: 'werden', wird: 'werden', werdet: 'werden',
  wurde: 'werden', wurdest: 'werden', wurden: 'werden', wurdet: 'werden', geworden: 'werden',
  // können
  kann: 'können', kannst: 'können', könnt: 'können',
  konnte: 'können', konntest: 'können', konnten: 'können', konntet: 'können', gekonnt: 'können',
  könnte: 'können', könntest: 'können', könnten: 'können',
  // müssen
  muss: 'müssen', musst: 'müssen', müsst: 'müssen',
  musste: 'müssen', musstest: 'müssen', mussten: 'müssen', gemusst: 'müssen',
  müsste: 'müssen', müsstest: 'müssen', müssten: 'müssen',
  // wollen
  will: 'wollen', willst: 'wollen', wollt: 'wollen',
  wollte: 'wollen', wolltest: 'wollen', wollten: 'wollen', gewollt: 'wollen',
  // sollen
  soll: 'sollen', sollst: 'sollen', sollt: 'sollen',
  sollte: 'sollen', solltest: 'sollen', sollten: 'sollen', gesollt: 'sollen',
  // dürfen
  darf: 'dürfen', darfst: 'dürfen', dürft: 'dürfen',
  durfte: 'dürfen', durftest: 'dürfen', durften: 'dürfen', gedurft: 'dürfen',
  dürfte: 'dürfen', dürftest: 'dürfen', dürften: 'dürfen',
  // mögen
  mag: 'mögen', magst: 'mögen', mögt: 'mögen',
  mochte: 'mögen', mochtest: 'mögen', mochten: 'mögen', gemocht: 'mögen',
  möchte: 'mögen', möchtest: 'mögen', möchten: 'mögen',
  // gehen
  gehst: 'gehen', geht: 'gehen',
  ging: 'gehen', gingst: 'gehen', gingen: 'gehen', gegangen: 'gehen',
  // kommen
  kommst: 'kommen', kommt: 'kommen',
  kam: 'kommen', kamst: 'kommen', kamen: 'kommen', gekommen: 'kommen',
  // geben
  gibst: 'geben', gibt: 'geben',
  gab: 'geben', gabst: 'geben', gaben: 'geben', gegeben: 'geben',
  // sehen
  siehst: 'sehen', sieht: 'sehen',
  sah: 'sehen', sahst: 'sehen', sahen: 'sehen', gesehen: 'sehen',
  // stehen
  stehst: 'stehen', steht: 'stehen',
  stand: 'stehen', standst: 'stehen', standen: 'stehen', gestanden: 'stehen',
  // wissen
  weiß: 'wissen', weißt: 'wissen', wisst: 'wissen',
  wusste: 'wissen', wusstest: 'wissen', wussten: 'wissen', gewusst: 'wissen',
  // lassen
  lässt: 'lassen', ließ: 'lassen', ließt: 'lassen', ließen: 'lassen', gelassen: 'lassen',
  // nehmen
  nimmst: 'nehmen', nimmt: 'nehmen',
  nahm: 'nehmen', nahmst: 'nehmen', nahmen: 'nehmen', genommen: 'nehmen',
  // fahren
  fährst: 'fahren', fährt: 'fahren',
  fuhr: 'fahren', fuhrst: 'fahren', fuhren: 'fahren', gefahren: 'fahren',
  // tragen
  trägst: 'tragen', trägt: 'tragen',
  trug: 'tragen', trugst: 'tragen', trugen: 'tragen', getragen: 'tragen',
  // schlagen
  schlägst: 'schlagen', schlägt: 'schlagen',
  schlug: 'schlagen', schlugst: 'schlagen', schlugen: 'schlagen', geschlagen: 'schlagen',
  // laufen
  läufst: 'laufen', läuft: 'laufen',
  lief: 'laufen', liefst: 'laufen', liefen: 'laufen', gelaufen: 'laufen',
  // halten
  hältst: 'halten', hält: 'halten',
  hielt: 'halten', hieltest: 'halten', hielten: 'halten', gehalten: 'halten',
  // fallen
  fällst: 'fallen', fällt: 'fallen',
  fiel: 'fallen', fielst: 'fallen', fielen: 'fallen', gefallen: 'fallen',
  // rufen
  rief: 'rufen', riefst: 'rufen', riefen: 'rufen', gerufen: 'rufen',
  // schreiben
  schrieb: 'schreiben', schriebst: 'schreiben', schrieben: 'schreiben', geschrieben: 'schreiben',
  // bleiben
  blieb: 'bleiben', bliebst: 'bleiben', blieben: 'bleiben', geblieben: 'bleiben',
  // treffen
  triffst: 'treffen', trifft: 'treffen',
  traf: 'treffen', trafst: 'treffen', trafen: 'treffen', getroffen: 'treffen',
  // sprechen
  sprichst: 'sprechen', spricht: 'sprechen',
  sprach: 'sprechen', sprachst: 'sprechen', sprachen: 'sprechen', gesprochen: 'sprechen',
  // helfen
  hilfst: 'helfen', hilft: 'helfen',
  half: 'helfen', halfst: 'helfen', halfen: 'helfen', geholfen: 'helfen',
  // sterben
  stirbst: 'sterben', stirbt: 'sterben',
  starb: 'sterben', starbst: 'sterben', starben: 'sterben', gestorben: 'sterben',
  // werfen
  wirfst: 'werfen', wirft: 'werfen',
  warf: 'werfen', warfst: 'werfen', warfen: 'werfen', geworfen: 'werfen',
  // essen
  isst: 'essen', esst: 'essen',
  aß: 'essen', aßt: 'essen', aßen: 'essen', gegessen: 'essen',
  // lesen
  liest: 'lesen', lest: 'lesen',
  las: 'lesen', last: 'lesen', lasen: 'lesen', gelesen: 'lesen',
  // sitzen
  sitzt: 'sitzen', saß: 'sitzen', saßt: 'sitzen', saßen: 'sitzen', gesessen: 'sitzen',
  // liegen
  liegt: 'liegen', lag: 'liegen', lagt: 'liegen', lagen: 'liegen', gelegen: 'liegen',
  // finden
  fand: 'finden', fandst: 'finden', fanden: 'finden', gefunden: 'finden',
  // trinken
  trank: 'trinken', trankst: 'trinken', tranken: 'trinken', getrunken: 'trinken',
  // beginnen
  begann: 'beginnen', begannen: 'beginnen', begonnen: 'beginnen',
  // gewinnen
  gewann: 'gewinnen', gewannen: 'gewinnen', gewonnen: 'gewinnen',
  // fliegen
  flog: 'fliegen', flogst: 'fliegen', flogen: 'fliegen', geflogen: 'fliegen',
  // ziehen
  zog: 'ziehen', zogst: 'ziehen', zogen: 'ziehen', gezogen: 'ziehen',
  // stoßen
  stößt: 'stoßen', stieß: 'stoßen', stießen: 'stoßen', gestoßen: 'stoßen',
  // fließen
  fließt: 'fließen', floss: 'fließen', flossen: 'fließen', geflossen: 'fließen',
  // heißen
  heißt: 'heißen', hieß: 'heißen', hießen: 'heißen', geheißen: 'heißen',
  // hängen
  hängt: 'hängen', hing: 'hängen', hingen: 'hängen', gehangen: 'hängen',
  // bringen
  brachte: 'bringen', brachtest: 'bringen', brachten: 'bringen', gebracht: 'bringen',
  // denken
  dachte: 'denken', dachtest: 'denken', dachten: 'denken', gedacht: 'denken',
  // kennen
  kannte: 'kennen', kanntest: 'kennen', kannten: 'kennen', gekannt: 'kennen',
  // nennen
  nannte: 'nennen', nanntest: 'nennen', nannten: 'nennen', genannt: 'nennen',
  // rennen
  rannte: 'rennen', ranntest: 'rennen', rannten: 'rennen', gerannt: 'rennen',
  // tun
  tust: 'tun', tut: 'tun', tat: 'tun', tatst: 'tun', taten: 'tun', getan: 'tun',
  // stehlen
  stiehlst: 'stehlen', stiehlt: 'stehlen',
  stahl: 'stehlen', stahlst: 'stehlen', stahlen: 'stehlen', gestohlen: 'stehlen',
  // empfehlen
  empfiehlst: 'empfehlen', empfiehlt: 'empfehlen',
  empfahl: 'empfehlen', empfahlst: 'empfehlen', empfahlen: 'empfehlen', empfohlen: 'empfehlen',
  // singen
  sang: 'singen', sangen: 'singen', gesungen: 'singen',
  // springen
  sprang: 'springen', sprangen: 'springen', gesprungen: 'springen',
  // schwimmen
  schwamm: 'schwimmen', schwammen: 'schwimmen', geschwommen: 'schwimmen',
  // heben
  hob: 'heben', hobst: 'heben', hoben: 'heben', gehoben: 'heben',
  // bitten
  bat: 'bitten', batst: 'bitten', baten: 'bitten', gebeten: 'bitten',
  // schießen
  schoss: 'schießen', schossen: 'schießen', geschossen: 'schießen',
}

const DE_DERIVATIONS: Array<[suffix: string, base: (stem: string) => string[]]> = [
  ['igkeiten', stem => [stem + 'igkeit', stem + 'ig']],
  ['igkeit', stem => [stem + 'ig', stem]],
  ['heiten', stem => [stem + 'heit', stem]],
  ['heit', stem => [stem]],
  ['keiten', stem => [stem + 'keit', stem]],
  ['keit', stem => [stem]],
  ['schaften', stem => [stem + 'schaft']],
  ['schaft', stem => [stem]],
  ['ungen', stem => [stem + 'ung', stem + 'en']],
  ['ung', stem => [stem + 'en', stem]],
  ['lichen', stem => [stem + 'lich']],
  ['lichem', stem => [stem + 'lich']],
  ['licher', stem => [stem + 'lich']],
  ['liches', stem => [stem + 'lich']],
  ['liche', stem => [stem + 'lich', stem]],
  ['lich', stem => [stem]],
  ['baren', stem => [stem + 'bar']],
  ['barem', stem => [stem + 'bar']],
  ['barer', stem => [stem + 'bar']],
  ['bares', stem => [stem + 'bar']],
  ['bare', stem => [stem + 'bar', stem]],
  ['bar', stem => [stem]],
]

const DE_STRIP_SUFFIXES = [
  'igkeiten', 'ischsten', 'lichsten', 'heiten', 'keiten', 'schaften', 'ungen',
  'enden', 'endem', 'ender', 'endes', 'ende',
  'esten', 'stem', 'sten', 'ster', 'stes', 'ste',
  'test', 'tet', 'ten', 'est', 'em', 'en', 'er', 'es',
  'te', 'st', 't', 'e', 'n', 's',
]

function germanCandidates(token: string): string[] {
  const out: string[] = []
  if (DE_IRREGULARS[token]) out.push(DE_IRREGULARS[token])
  for (const [suffix, base] of DE_DERIVATIONS) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length >= 3) out.push(...base(stem))
  }
  // Try infinitive directly (imperative / bare stem)
  out.push(token + 'en', token + 'n')
  for (const suffix of DE_STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length < 3) continue
    out.push(stem, stem + 'en', stem + 'n', stem + 'e')
    // Umlaut plurals: "häuser" → "haus", "bäume" → "baum"
    const unumlauted = stem.replace(/ä(?=[^äöü]*$)/, 'a').replace(/ö(?=[^äöü]*$)/, 'o').replace(/ü(?=[^äöü]*$)/, 'u')
    if (unumlauted !== stem) out.push(unumlauted)
  }
  // Regular past participle: ge + stem + t ("gemacht" → "machen"), also inside
  // separable verbs ("aufgemacht" → "aufmachen")
  const participle = token.match(/^(.*?)ge(.{2,}?)(et|t|en)$/)
  if (participle) out.push(participle[1] + participle[2] + 'en', participle[1] + participle[2] + 'n')
  return out
}

// A compound's head is a real word; a derivational suffix is not, even when it
// happens to spell one. Splitting "kortademigheid" into "kortademig" + "heid"
// resolved "heid" to "heiden" and answered "un païen" — the tail of a derived
// word must never be treated as the thing the word denotes.
const DERIVATIONAL_TAILS: Partial<Record<Lang, Set<string>>> = {
  nl: new Set([
    'heid', 'heden', 'ing', 'ingen', 'lijk', 'lijke', 'baar', 'bare', 'loos', 'loze',
    'schap', 'dom', 'nis', 'achtig', 'sel', 'ster', 'te', 'je', 'tje', 'er', 'aar',
  ]),
  sv: new Set([
    'het', 'heten', 'heter', 'ning', 'ningen', 'ningar', 'lig', 'ligt', 'liga',
    'lös', 'löst', 'skap', 'dom', 'else', 'ande', 'ende', 'are', 'eri', 'aktig',
  ]),
  de: new Set([
    'ung', 'ungen', 'heit', 'heiten', 'keit', 'keiten',
    'schaft', 'schaften', 'lich', 'liche', 'bar', 'bare',
    'ig', 'ige', 'isch', 'ische', 'nis', 'nisse',
  ]),
}

export function isDerivationalTail(token: string, lang: Lang): boolean {
  return DERIVATIONAL_TAILS[lang]?.has(token) ?? false
}

// Ordered lemma guesses for a token, best first. Callers stop at the first hit.
export function lemmaCandidates(token: string, lang: Lang): string[] {
  if (lang === 'sv') return swedishCandidates(token)
  if (lang === 'en') return englishCandidates(token)
  if (lang === 'nl') return dutchCandidates(token)
  if (lang === 'es') return spanishCandidates(token)
  if (lang === 'de') return germanCandidates(token)
  return []
}

// Strips the article/infinitive marker a headword may carry ("en kvinna", "att gå", "to go")
const HEADWORD_PREFIX: Partial<Record<Lang, RegExp>> = {
  sv: /^(en|ett|att)\s+/,
  en: /^to\s+/,
  nl: /^(de|het)\s+/,
  es: /^(el|la|los|las)\s+/,
  de: /^(der|die|das)\s+/,
}

export function headwordKey(raw: string, lang: Lang): string {
  const base = raw.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
  const prefix = HEADWORD_PREFIX[lang]
  return prefix ? base.replace(prefix, '') : base
}
