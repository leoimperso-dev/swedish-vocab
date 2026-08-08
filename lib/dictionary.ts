// In-memory term → translation dictionary built from the Word table, one cache
// per language pair. Looks up any surface form: headwords, stored inflections,
// then the language's suffix stripping rules (lib/morphology.ts).
import { db } from '@/lib/db'
import { parseDetails } from '@/lib/word-display'
import { headwordKey, isSuffixShorthand, lemmaCandidates } from '@/lib/morphology'
import { pairOf, type PairId } from '@/lib/courses'

export interface DictEntry {
  term: string // display headword ("en kvinna")
  translation: string // best translation(s)
  forms: string | null
}

const caches = new Map<PairId, Map<string, DictEntry>>()

async function buildCache(pair: PairId): Promise<Map<string, DictEntry>> {
  const lang = pairOf(pair).term
  const words = await db.word.findMany({
    where: { pair },
    select: { term: true, translation: true, forms: true, details: true, frequencyRank: true },
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
      term: word.term.replace(/\(.*?\)/g, '').trim(),
      translation: details?.translations ? details.translations.join(', ') : word.translation,
      forms: formsRecord
        ? formOrder.filter(k => formsRecord[k]).map(k => formsRecord[k]).join(', ') || null
        : null,
    }

    const keys = new Set<string>([headwordKey(word.term, lang)])
    if (formsRecord) {
      for (const v of Object.values(formsRecord)) {
        if (typeof v === 'string') {
          const form = v.toLowerCase().trim()
          if (form.length >= 3 && !isSuffixShorthand(form, lang)) keys.add(form)
        }
      }
    }
    for (const key of keys) {
      if (key && !map.has(key)) map.set(key, entry)
    }
  }
  return map
}

export async function lookupWord(raw: string, pair: PairId): Promise<DictEntry | null> {
  let cache = caches.get(pair)
  if (!cache) {
    cache = await buildCache(pair)
    caches.set(pair, cache)
  }

  const token = raw.toLowerCase().replace(/[.,!?;:"«»()[\]…'’„“”–—]/g, '').trim()
  if (!token) return null

  const direct = cache.get(token)
  if (direct) return direct

  for (const candidate of lemmaCandidates(token, pairOf(pair).term)) {
    const hit = cache.get(candidate)
    if (hit) return hit
  }
  return null
}
