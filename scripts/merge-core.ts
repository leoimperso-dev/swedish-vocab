import fs from 'fs'
import path from 'path'

// Merges generated vocabulary chunks into Swedish_core_3000.txt, dropping duplicate headwords.
// Usage: tsx scripts/merge-core3000.ts <chunksDir> <outputFile>

const CHUNK_ORDER = [
  'chunk_verbs.txt',
  'chunk_verbs2.txt',
  'chunk_nouns_daily.txt',
  'chunk_nouns_people.txt',
  'chunk_nouns_society.txt',
  'chunk_nouns_world.txt',
  'chunk_nouns_law.txt',
  'chunk_nouns_science.txt',
  'chunk_nouns_culture.txt',
  'chunk_nouns_abstract.txt',
  'chunk_adjectives.txt',
  'chunk_adjectives2.txt',
  'chunk_function.txt',
]

const SEPARATOR_RE = /\s[—-]\s/

function headwordKey(line: string): string | null {
  if (!SEPARATOR_RE.test(line)) return null
  const swedish = line.split(SEPARATOR_RE)[0]
  return swedish.replace(/\s*\([^)]+\)/, '').trim().toLowerCase()
}

function main() {
  const chunksDir = process.argv[2]
  const outputFile = process.argv[3]
  if (!chunksDir || !outputFile) {
    console.error('Usage: tsx scripts/merge-core3000.ts <chunksDir> <outputFile>')
    process.exit(1)
  }

  const seen = new Set<string>()
  const output: string[] = []
  let total = 0
  let duplicates = 0

  for (const chunkName of CHUNK_ORDER) {
    const chunkPath = path.join(chunksDir, chunkName)
    if (!fs.existsSync(chunkPath)) {
      console.warn(`[merge] MISSING: ${chunkName}`)
      continue
    }
    let kept = 0
    for (const rawLine of fs.readFileSync(chunkPath, 'utf-8').split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      const key = headwordKey(line)
      if (key === null) {
        // Section header or comment — keep as-is
        output.push(line)
        continue
      }
      if (seen.has(key)) {
        duplicates++
        continue
      }
      seen.add(key)
      output.push(line)
      kept++
      total++
    }
    console.log(`[merge] ${chunkName}: ${kept} words kept`)
  }

  fs.writeFileSync(outputFile, output.join('\n') + '\n', 'utf-8')
  console.log(`[merge] Total: ${total} unique words (${duplicates} duplicates removed)`)
  console.log(`[merge] Written to ${outputFile}`)
}

main()
