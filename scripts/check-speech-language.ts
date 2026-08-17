// QA: everything spoken to a learner must be in the language they are learning,
// and read by a voice of that language.
//
// The trap is that `Word.term`, `Word.examples`, stories, grammar and dialogues
// are all written in the pair's `term` language, which is NOT the learned one on
// an inverted course (a Swede learning French shares the `sv-fr` pair with a
// French speaker learning Swedish). Reading `term` in the learned voice there
// said Swedish words with a French voice, and never one French word.
//
// This builds a real session for every course and checks the language of what
// each exercise would speak.
//
// Usage: pnpm tsx scripts/check-speech-language.ts
import 'dotenv/config'
import fs from 'fs'
import { db } from '../lib/db'
import { buildExercises } from '../lib/study/build'
import { learnedSpeech } from '../lib/word-display'
import { COURSES, answerLang, courseDirections, learnsTermLanguage, localeOf, pairOf } from '../lib/courses'
import type { CefrLevel } from '../lib/cefr'
import type { ExerciseType } from '../types'

// The exercise types whose spoken content is drawn from the pair's `term` side,
// and which therefore may only reach a learner of that side
const TERM_SIDE_TYPES: ExerciseType[] = ['CLOZE', 'CONJUGATION']

// Exercises whose answer is the learned language whatever the card's schedule
// says — see exerciseDirection in lib/study/build.ts
const PRODUCES_LEARNED: ExerciseType[] = ['LISTENING', 'CLOZE', 'CONJUGATION']

const SESSION_SIZE = 15

function langOfSpokenWord(word: { pair: string; term: string; translation: string }, text: string): string {
  const pair = pairOf(word.pair)
  return text === word.term ? pair.term : pair.translation
}

async function main() {
  const user = await db.user.findFirst({ select: { id: true } })
  if (!user) {
    console.error('aucun compte en base — impossible de construire une session')
    process.exit(1)
  }

  let failures = 0
  for (const course of COURSES) {
    const label = `${course.native} → ${course.learned} (${course.pair})`
    const exercises = await buildExercises({
      userId: user.id,
      course,
      level: 'A2' as CefrLevel,
      direction: courseDirections(course)[0],
      size: SESSION_SIZE,
      newWords: 5,
    })
    if (exercises.length === 0) {
      console.log(`${label}: aucun mot, ignoré`)
      continue
    }

    const problems: string[] = []

    // 1. What the speaker button reads, on every card
    for (const exercise of exercises) {
      for (const item of learnedSpeech(exercise.word, course)) {
        const spoken = langOfSpokenWord(exercise.word, item.text)
        // Inflected forms are term-side by construction; learnedSpeech only adds
        // them when that side is the learned one, so an unknown text is a form
        const lang = exercise.word.term === item.text || exercise.word.translation === item.text
          ? spoken
          : pairOf(exercise.word.pair).term
        if (lang !== course.learned) {
          problems.push(`"${item.text}" est en ${lang}, pas en ${course.learned}`)
        }
        if (item.locale !== localeOf(course.learned)) {
          problems.push(`"${item.text}" lu avec la voix ${item.locale}`)
        }
      }
    }

    // 2. Exercises built on term-side content must not reach an inverted course
    if (!learnsTermLanguage(course)) {
      for (const exercise of exercises) {
        if (TERM_SIDE_TYPES.includes(exercise.exerciseType)) {
          problems.push(`${exercise.exerciseType} sert du contenu en ${pairOf(course.pair).term}`)
        }
      }
    }

    // 3. A blitz round flips directions at random. Whatever it flips, the
    // exercises that can only be answered in the learned language must still
    // be asked that way round — a dictation credited to `learned → native` has
    // the learner typing English while the French schedule advances.
    const blitz = await buildExercises({
      userId: user.id, course, level: 'A2' as CefrLevel,
      direction: courseDirections(course)[0],
      size: SESSION_SIZE, newWords: 0, policy: 'DUEL', flipDirections: true,
    })
    for (const exercise of blitz) {
      if (PRODUCES_LEARNED.includes(exercise.exerciseType) && answerLang(exercise.direction!) !== course.learned) {
        problems.push(`${exercise.exerciseType} répond en ${answerLang(exercise.direction!)} (${exercise.direction})`)
      }
      // Only multiple choice may be flipped: typing the native language drills nothing
      if (exercise.exerciseType === 'TYPING' && answerLang(exercise.direction!) !== course.learned) {
        problems.push(`TYPING fait écrire en ${answerLang(exercise.direction!)}`)
      }
    }

    if (problems.length === 0) {
      console.log(`OK  ${label} — ${exercises.length} exercices`)
    } else {
      failures++
      console.log(`ÉCHEC ${label}`)
      for (const problem of [...new Set(problems)].slice(0, 5)) console.log(`      ${problem}`)
    }
  }

  // Stories, dialogues and grammar are term-side prose read in the learned
  // voice. Hiding their links is not enough — the URL stays reachable, so each
  // page has to turn an inverted course away itself.
  const GUARDED_PAGES = [
    'app/(app)/reading/page.tsx',
    'app/(app)/reading/[slug]/page.tsx',
    'app/(app)/grammar/page.tsx',
    'app/(app)/grammar/[slug]/page.tsx',
    'app/(app)/conversation/page.tsx',
    'app/(app)/conversation/[slug]/page.tsx',
  ]
  for (const page of GUARDED_PAGES) {
    if (!fs.readFileSync(page, 'utf-8').includes('learnsTermLanguage')) {
      failures++
      console.log(`ÉCHEC ${page} sert du contenu term-side sans vérifier le cours`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} problème(s) : du contenu est prononcé dans la mauvaise langue`)
    process.exit(1)
  }
  console.log('\nchaque cours ne prononce que la langue apprise')
}

main().finally(() => db.$disconnect())
