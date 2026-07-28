import fs from 'fs'
import path from 'path'

export interface ParsedWord {
  swedish: string
  french: string
  wordType: 'VERB' | 'NOUN_EN' | 'NOUN_ETT' | 'ADJECTIVE' | 'ADVERB' | 'FUNCTION' | 'PHRASE' | 'OTHER'
  category: string | null
  forms: Record<string, string> | null
  source: string
}

const SEPARATOR_RE = /\s[—-]\s/

function detectWordType(swedish: string): ParsedWord['wordType'] {
  const s = swedish.trim().toLowerCase()
  if (s.startsWith('en ')) return 'NOUN_EN'
  if (s.startsWith('ett ')) return 'NOUN_ETT'
  // Verb pattern: word (present, preterit, supine)
  if (/\([^)]+,\s*[^)]+,\s*[^)]+\)/.test(swedish)) return 'VERB'
  // Adjective pattern: word (comparative, superlative)
  if (/\([^),]+,\s*[^),]+\)/.test(swedish)) return 'ADJECTIVE'
  return 'OTHER'
}

function extractVerbForms(swedish: string): Record<string, string> | null {
  const match = swedish.match(/\(([^)]+)\)/)
  if (!match) return null
  const parts = match[1].split(',').map(s => s.trim())
  if (parts.length < 3) return null
  return { present: parts[0], preterit: parts[1], supine: parts[2] }
}

function extractNounPlural(swedish: string): Record<string, string> | null {
  const match = swedish.match(/\(([^)]+)\)/)
  if (!match) return null
  return { plural: match[1].trim() }
}

function extractAdjForms(swedish: string): Record<string, string> | null {
  const match = swedish.match(/\(([^)]+)\)/)
  if (!match) return null
  const parts = match[1].split(',').map(s => s.trim())
  if (parts.length !== 2) return null
  return { comparative: parts[0], superlative: parts[1] }
}

function parseSwedishTxt(filePath: string): ParsedWord[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const words: ParsedWord[] = []
  let currentCategory: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Detect category headers like "[Famille]" or "=== VERBES ==="
    const categoryMatch = line.match(/^\[([^\]]+)\]$/) || line.match(/^===\s*(.+?)\s*===$/)
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim()
      continue
    }

    // Skip lines without a separator
    if (!SEPARATOR_RE.test(line)) continue

    // Skip grammar notes (lines starting with bullets or numbered items that are long sentences)
    if (line.startsWith('•') || line.startsWith('-') || line.match(/^\d+\.\s+[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]/)) {
      // Could still be vocabulary if it has a separator
    }

    const parts = line.split(SEPARATOR_RE)
    if (parts.length < 2) continue

    // Clean the Swedish part: strip list markers and numbering
    let swedish = parts[0]
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/^[•\-\t\s]+/, '')
      .trim()

    const french = parts.slice(1).join(' — ').trim()

    if (!swedish || !french || swedish.length < 2 || french.length < 2) continue

    // Skip obvious grammar notes
    if (swedish.includes('->') || swedish.includes('→') || french.length > 200) continue

    const wordType = detectWordType(swedish)
    let forms: Record<string, string> | null = null

    if (wordType === 'VERB') {
      forms = extractVerbForms(swedish)
      // Clean: keep only the base word
      swedish = swedish.replace(/\s*\([^)]+\)/, '').trim()
    } else if (wordType === 'NOUN_EN' || wordType === 'NOUN_ETT') {
      forms = extractNounPlural(swedish)
      swedish = swedish.replace(/\s*\([^)]+\)/, '').trim()
    } else if (wordType === 'ADJECTIVE') {
      forms = extractAdjForms(swedish)
      swedish = swedish.replace(/\s*\([^)]+\)/, '').trim()
    }

    words.push({ swedish, french, wordType, category: currentCategory, forms, source: path.basename(filePath) })
  }

  return words
}

function parseCore3000(filePath: string): ParsedWord[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`[parse] ${filePath} not found, skipping`)
    return []
  }
  // Same logic — the core file uses the same separator format
  return parseSwedishTxt(filePath)
}

export function parseAllVocabulary(dataDir: string): ParsedWord[] {
  const txtPath = path.join(dataDir, 'Swedish.txt')
  const corePath = path.join(dataDir, 'Swedish_core_5000.txt')

  const from_txt = parseSwedishTxt(txtPath)
  const from_core = parseCore3000(corePath)

  console.log(`[parse] Swedish.txt: ${from_txt.length} words`)
  console.log(`[parse] Core: ${from_core.length} words`)
  console.log(`[parse] Total: ${from_txt.length + from_core.length} words`)

  return [...from_txt, ...from_core]
}

// Run as script
if (require.main === module) {
  const dataDir = process.argv[2] || path.join(__dirname, '..', '..', '..', 'Desktop', 'pro')
  const words = parseAllVocabulary(dataDir)
  console.log('\nSample (first 5):')
  words.slice(0, 5).forEach(w => console.log(JSON.stringify(w)))
}
