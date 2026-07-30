// In-memory Swedish → French dictionary built from the Word table.
// Looks up any surface form: headwords, stored inflections, then common
// Swedish suffix stripping (definite forms, plurals, genitive, verb endings).
import { db } from '@/lib/db'
import { parseDetails } from '@/lib/word-display'

export interface DictEntry {
  swedish: string // display headword ("en kvinna")
  french: string // best translation(s)
  forms: string | null
}

const SUFFIX_SHORTHANDS = new Set([
  'r', 'ar', 'er', 'a', 'de', 'ade', 'dde', 'te', 't', 'at', 'tt', 'it',
  'en', 'n', 'na', 'are', 'ast', 'aste',
])

// Tried in order on unmatched tokens (longest first)
const STRIP_SUFFIXES = [
  'ernas', 'arnas', 'ornas', 'erna', 'arna', 'orna', 'ens', 'ets', 'ade', 'dde',
  'en', 'et', 'ar', 'er', 'or', 'na', 'de', 'te', 'n', 't', 's', 'a',
]

let cache: Map<string, DictEntry> | null = null

function baseKey(swedish: string): string {
  return swedish.toLowerCase().replace(/\//g, '').replace(/\(.*?\)/g, '').trim()
    .replace(/^(en|ett|att)\s+/, '')
}

async function buildCache(): Promise<Map<string, DictEntry>> {
  const words = await db.word.findMany({
    select: { swedish: true, french: true, forms: true, details: true, frequencyRank: true },
    // Common words win when several entries share a surface form
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })

  const map = new Map<string, DictEntry>()
  const formOrder = ['present', 'preterit', 'supine', 'plural', 'ett', 'comparative', 'superlative']

  for (const word of words) {
    const details = parseDetails(word.details)
    const formsRecord = word.forms && typeof word.forms === 'object' ? word.forms as Record<string, string> : null
    const entry: DictEntry = {
      swedish: word.swedish.replace(/\(.*?\)/g, '').trim(),
      french: details?.translations ? details.translations.join(', ') : word.french,
      forms: formsRecord
        ? formOrder.filter(k => formsRecord[k]).map(k => formsRecord[k]).join(', ') || null
        : null,
    }

    const keys = new Set<string>([baseKey(word.swedish)])
    if (formsRecord) {
      for (const v of Object.values(formsRecord)) {
        if (typeof v === 'string') {
          const form = v.toLowerCase().trim()
          if (form.length >= 3 && !SUFFIX_SHORTHANDS.has(form)) keys.add(form)
        }
      }
    }
    for (const key of keys) {
      if (key && !map.has(key)) map.set(key, entry)
    }
  }
  return map
}

export async function lookupWord(raw: string): Promise<DictEntry | null> {
  if (!cache) cache = await buildCache()

  const token = raw.toLowerCase().replace(/[.,!?;:"«»()[\]…'’„“”–—]/g, '').trim()
  if (!token) return null

  const direct = cache.get(token)
  if (direct) return direct

  // Suffix stripping: "huset" → "hus", "flickorna" → "flicka", "läser" → "läsa"
  const VERB_SUFFIXES = new Set(['ade', 'dde', 'de', 'te'])
  for (const suffix of STRIP_SUFFIXES) {
    if (!token.endsWith(suffix)) continue
    const stem = token.slice(0, -suffix.length)
    if (stem.length < 2) continue
    // Verb endings: rebuild the infinitive first ("väntade" → "vänta", not the homograph "vänt")
    const candidates = VERB_SUFFIXES.has(suffix)
      ? [stem + 'a', stem, stem + 'e']
      : [stem, stem + 'a', stem + 'e']
    for (const candidate of candidates) {
      const hit = cache.get(candidate)
      if (hit) return hit
    }
    // Undouble final consonant: "rummet" → "rumm" → "rum", "mannen" → "mann" → "man"
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      const single = stem.slice(0, -1)
      const hit2 = cache.get(single) ?? cache.get(single + 'a')
      if (hit2) return hit2
    }
  }
  return null
}
