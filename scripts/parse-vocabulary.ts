import fs from 'fs'
import path from 'path'
import { PAIRS, type Lang, type PairId } from '../lib/courses'

export type WordTypeName =
  | 'VERB' | 'NOUN_EN' | 'NOUN_ETT' | 'NOUN' | 'ADJECTIVE' | 'ADVERB' | 'FUNCTION' | 'PHRASE' | 'OTHER'

export interface ParsedWord {
  pair: PairId
  term: string
  translation: string
  wordType: WordTypeName
  category: string | null
  forms: Record<string, string> | null
  source: string
}

const SEPARATOR_RE = /\s[—-]\s/

// Which vocabulary file feeds which pair
const SOURCES: Array<{ file: string; pair: PairId }> = [
  { file: 'Swedish.txt', pair: 'sv-fr' },
  { file: 'Swedish_core_5000.txt', pair: 'sv-fr' },
  { file: 'English_core_5000.txt', pair: 'en-fr' },
  { file: 'English_wiki.txt', pair: 'en-fr' },
  { file: 'Dutch_core_2000.txt', pair: 'nl-fr' },
  // *_wiki.txt: bulk vocabulary from kaikki.org Wiktionary extracts (CC BY-SA),
  // frequency-filtered — regenerate with Desktop\pro\generate-wiki-vocab.py
  { file: 'Dutch_wiki.txt', pair: 'nl-fr' },
]

function parenthesised(term: string): string[] | null {
  const match = term.match(/\(([^)]+)\)/)
  return match ? match[1].split(',').map(s => s.trim()) : null
}

// Swedish encodes the type in the headword itself: article prefix for nouns,
// number of parenthesised forms for verbs (3) and adjectives (2).
function detectSwedish(term: string): WordTypeName {
  const s = term.trim().toLowerCase()
  if (s.startsWith('en ')) return 'NOUN_EN'
  if (s.startsWith('ett ')) return 'NOUN_ETT'
  if (/\([^)]+,\s*[^)]+,\s*[^)]+\)/.test(term)) return 'VERB'
  if (/\([^),]+,\s*[^),]+\)/.test(term)) return 'ADJECTIVE'
  return 'OTHER'
}

// English has no article prefix, and verbs and adjectives both carry two forms
// ("speak (spoke, spoken)" vs "good (better, best)"), so the section header states
// the type: "=== VERBES ===" or "=== NOMS | MAISON & LOGEMENT ===", where the part
// after the pipe is the themed category shown in the UI.
const ENGLISH_SECTIONS: Array<[RegExp, WordTypeName]> = [
  [/^VERBE/i, 'VERB'],
  [/^NOM/i, 'NOUN'],
  [/^ADJECTIF/i, 'ADJECTIVE'],
  [/^ADVERBE/i, 'ADVERB'],
  [/^(MOTS?[- ]OUTILS?|GRAMMAIRE)/i, 'FUNCTION'],
  [/^EXPRESSION/i, 'PHRASE'],
]

function splitEnglishHeader(header: string): { type: WordTypeName; category: string } {
  const [typePart, ...rest] = header.split('|').map(s => s.trim())
  return {
    type: ENGLISH_SECTIONS.find(([re]) => re.test(typePart))?.[1] ?? 'OTHER',
    category: rest.length > 0 ? rest.join(' | ') : typePart,
  }
}

function extractForms(term: string, wordType: WordTypeName, lang: Lang): Record<string, string> | null {
  const parts = parenthesised(term)
  if (!parts) return null

  if (wordType === 'VERB') {
    if (lang === 'sv') {
      return parts.length >= 3 ? { present: parts[0], preterit: parts[1], supine: parts[2] } : null
    }
    return parts.length >= 2 ? { past: parts[0], pastParticiple: parts[1] } : null
  }
  if (wordType === 'NOUN_EN' || wordType === 'NOUN_ETT' || wordType === 'NOUN') {
    return { plural: parts.join(', ') }
  }
  if (wordType === 'ADJECTIVE') {
    return parts.length === 2 ? { comparative: parts[0], superlative: parts[1] } : null
  }
  // English function words note their variant in parentheses ("this (these)") —
  // store it so the dictionary can look it up. Swedish OTHER entries keep their
  // historic behavior: parentheses there are free-form usage notes.
  if (lang !== 'sv') return { plural: parts.join(', ') }
  return null
}

function parseFile(filePath: string, pair: PairId): ParsedWord[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`[parse] ${filePath} not found, skipping`)
    return []
  }

  const lang = PAIRS[pair].term
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  const words: ParsedWord[] = []
  let currentCategory: string | null = null
  let sectionType: WordTypeName = 'OTHER'

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Detect category headers like "[Famille]" or "=== VERBES ==="
    const categoryMatch = line.match(/^\[([^\]]+)\]$/) || line.match(/^===\s*(.+?)\s*===$/)
    if (categoryMatch) {
      const header = categoryMatch[1].trim()
      if (lang === 'sv') {
        currentCategory = header
      } else {
        const parsed = splitEnglishHeader(header)
        sectionType = parsed.type
        currentCategory = parsed.category
      }
      continue
    }

    if (!SEPARATOR_RE.test(line)) continue

    const parts = line.split(SEPARATOR_RE)
    if (parts.length < 2) continue

    // Clean the headword: strip list markers and numbering
    let term = parts[0]
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/^[•\-\t\s]+/, '')
      .trim()

    const translation = parts.slice(1).join(' — ').trim()

    // English and Dutch have real one-letter words ("a", "I", "u") — only
    // Swedish keeps the 2-char floor, where single letters are numbering noise.
    const minTerm = lang === 'sv' ? 2 : 1
    if (!term || !translation || term.length < minTerm || translation.length < 2) continue

    // Skip obvious grammar notes
    if (term.includes('->') || term.includes('→') || translation.length > 200) continue

    const wordType = lang === 'sv' ? detectSwedish(term) : sectionType
    const forms = extractForms(term, wordType, lang)
    // Keep only the base word once the forms are extracted. English strips the
    // parenthesised part unconditionally — leaving it in would make it part of
    // the stored headword ("this (these)").
    if (forms || lang !== 'sv') term = term.replace(/\s*\([^)]+\)/, '').trim()

    words.push({
      pair,
      term,
      translation,
      wordType,
      category: currentCategory,
      forms,
      source: path.basename(filePath),
    })
  }

  return words
}

export function parseAllVocabulary(dataDir: string): ParsedWord[] {
  const all: ParsedWord[] = []
  for (const { file, pair } of SOURCES) {
    const words = parseFile(path.join(dataDir, file), pair)
    console.log(`[parse] ${file} (${pair}): ${words.length} words`)
    all.push(...words)
  }
  console.log(`[parse] Total: ${all.length} words`)
  return all
}

// Run as script
if (require.main === module) {
  const dataDir = process.argv[2] || path.join(__dirname, '..', '..', '..', 'Desktop', 'pro')
  const words = parseAllVocabulary(dataDir)
  console.log('\nSample (first 5):')
  words.slice(0, 5).forEach(w => console.log(JSON.stringify(w)))
}
