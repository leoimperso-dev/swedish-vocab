// Imports one bilingual text as a story, from two plain-text files.
//
// The generated stories are written for learners and carry no translation: the
// word popover is enough. Real-world prose is another matter — a paragraph of
// golf rules can be understood word by word and still mean nothing — so a
// source that comes with its own translation keeps it, paragraph for paragraph.
//
// Usage:
//   pnpm tsx scripts/add-story.ts <term.txt> <translation.txt> <slug> "<titre>" "<titre traduit>" [pair] [level]
//
// Each file: paragraphs separated by a blank line, in the same order on both
// sides. The counts must match — that alignment is the whole feature.
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'
import { asPairId } from '../lib/courses'

const LEVELS = new Set(['beginner', 'intermediate', 'expert', 'dialogue'])

function paragraphs(file: string): string[] {
  return fs.readFileSync(file, 'utf-8')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map(p => p.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
}

async function main() {
  const [termFile, translationFile, slug, title, titleTranslated, pairArg, levelArg] = process.argv.slice(2)
  if (!termFile || !translationFile || !slug || !title || !titleTranslated) {
    console.error('usage: pnpm tsx scripts/add-story.ts <term.txt> <translation.txt> <slug> "<titre>" "<titre traduit>" [pair] [level]')
    process.exit(1)
  }
  const pair = asPairId(pairArg)
  const level = levelArg && LEVELS.has(levelArg) ? levelArg : 'expert'

  const termParagraphs = paragraphs(termFile)
  const translatedParagraphs = paragraphs(translationFile)
  if (termParagraphs.length !== translatedParagraphs.length) {
    console.error(
      `Les deux textes n'ont pas le même nombre de paragraphes ` +
      `(${termParagraphs.length} vs ${translatedParagraphs.length}). ` +
      `Sans cet alignement la traduction affichée serait celle d'un autre paragraphe.`,
    )
    process.exit(1)
  }

  const body = termParagraphs.join('\n\n')
  const story = await db.story.upsert({
    where: { slug },
    create: {
      pair, slug, title, titleTranslated, level,
      body,
      bodyTranslated: translatedParagraphs.join('\n\n'),
      wordCount: body.split(/\s+/).filter(Boolean).length,
    },
    update: {
      title, titleTranslated, level,
      body,
      bodyTranslated: translatedParagraphs.join('\n\n'),
      wordCount: body.split(/\s+/).filter(Boolean).length,
    },
  })
  console.log(`${story.slug} (${pair}, ${level}) — ${termParagraphs.length} paragraphes, ${story.wordCount} mots`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
