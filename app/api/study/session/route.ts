import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourseWithLevel } from '@/lib/current-course'
import { levelsAtOrAbove } from '@/lib/cefr'
import { answerableExamples } from '@/lib/cloze'
import { glossSenses, glossesOverlap } from '@/lib/gloss'
import {
  courseDirections, defaultDirection, learnsTermLanguage, pairOf, promptLang, verbFormsFor,
  type Course, type Direction,
} from '@/lib/courses'
import type { ExerciseType } from '@/types'
import type { Word, UserWord } from '@prisma/client'

const SESSION_SIZE = 15
const NEW_WORDS_PER_SESSION = 5
const FORCED_MODES: ExerciseType[] = ['FLASHCARD', 'QCM', 'TYPING', 'CONJUGATION', 'CLOZE', 'LISTENING']

function hasFullVerbForms(forms: unknown, course: Course): boolean {
  if (!forms || typeof forms !== 'object') return false
  const keys = verbFormsFor(pairOf(course.pair).term)
  if (keys.length === 0) return false
  const f = forms as Record<string, unknown>
  return keys.every(k => typeof f[k] === 'string' && f[k])
}

function hasExamples(examples: unknown): boolean {
  return Array.isArray(examples) && examples.length > 0
}

// Cloze hides one word of a real sentence and shows its French translation.
// That only works for content words: blanking a pronoun or a preposition asks
// the learner to guess something the translation cannot disambiguate — "sa
// mort" gives no way to choose between "his" and "her".
const CLOZE_TYPES = new Set(['VERB', 'NOUN', 'NOUN_EN', 'NOUN_ETT', 'ADJECTIVE', 'ADVERB'])

function clozeEligible(word: Word): boolean {
  if (!CLOZE_TYPES.has(word.wordType) || !hasExamples(word.examples)) return false
  // ...and the sentence has to point at the hidden word, or the card is a
  // coin toss: "id" glossed "ça" over "Amène ta carte d'étudiant"
  const examples = word.examples as unknown as Array<{ translation?: string }>
  return answerableExamples(examples, word.translation).length > 0
}

function selectExerciseType(
  userWord: UserWord | null,
  word: Word,
  course: Course,
  termExercises: boolean,
): ExerciseType {
  if (!userWord || userWord.repetitions === 0) return 'FLASHCARD'
  if (userWord.repetitions <= 2) return 'QCM'
  const pool: ExerciseType[] = ['TYPING']
  // Dictation always drills the learned language, whichever side it sits on
  pool.push('LISTENING')
  if (termExercises && word.wordType === 'VERB' && hasFullVerbForms(word.forms, course)) pool.push('CONJUGATION')
  if (termExercises && clozeEligible(word)) pool.push('CLOZE')
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { course, level } = await getCourseWithLevel(userId)
  const pair = course.pair
  // Conjugation and cloze drill the pair's `term` language: only its learners get them
  const termExercises = learnsTermLanguage(course)

  const requested = req.nextUrl.searchParams.get('direction')
  const direction: Direction = courseDirections(course).find(d => d === requested)
    ?? defaultDirection(course)
  const modeParam = req.nextUrl.searchParams.get('mode') as ExerciseType | null
  const termOnlyMode = modeParam === 'CONJUGATION' || modeParam === 'CLOZE'
  const forcedMode = modeParam && FORCED_MODES.includes(modeParam) && (!termOnlyMode || termExercises)
    ? modeParam
    : null

  // Conjugation needs verbs with complete forms; cloze needs example sentences (checked in JS below)
  const conjugationOnly = forcedMode === 'CONJUGATION'
  const clozeOnly = forcedMode === 'CLOZE'
  const needsEligibility = conjugationOnly || clozeOnly
  const isEligible = (word: Word) =>
    conjugationOnly ? hasFullVerbForms(word.forms, course) : clozeOnly ? clozeEligible(word) : true
  // studyable excludes entries that make no exercise — see scripts/mark-studyable.ts
  const wordFilter = { pair, studyable: true, ...(conjugationOnly ? { wordType: 'VERB' as const } : {}) }

  // 1. Due words (SM-2 scheduled for today, in the session's direction)
  const dueUserWords = (await db.userWord.findMany({
    where: { userId, direction, nextReview: { lte: new Date() }, word: wordFilter },
    include: { word: true },
    orderBy: { nextReview: 'asc' },
    take: needsEligibility ? SESSION_SIZE * 3 : SESSION_SIZE - NEW_WORDS_PER_SESSION,
  }))
    .filter(uw => isEligible(uw.word))
    .slice(0, SESSION_SIZE - NEW_WORDS_PER_SESSION)

  // 2. New words (never studied in this direction)
  const studiedWordIds = await db.userWord.findMany({
    where: { userId, direction },
    select: { wordId: true },
  })
  const studiedIds = studiedWordIds.map(uw => uw.wordId)

  const newWordsTarget = Math.max(NEW_WORDS_PER_SESSION, SESSION_SIZE - dueUserWords.length)
  // The declared level is a floor on new words: someone who says B1 is not asked
  // to translate "je" or "tu". Words already started keep coming back regardless.
  const levelFilter = level ? { cefr: { in: levelsAtOrAbove(level) } } : {}
  const drawNewWords = (filter: object) =>
    db.word.findMany({
      where: { id: { notIn: studiedIds }, ...wordFilter, ...filter },
      take: needsEligibility ? newWordsTarget * 3 : newWordsTarget,
      // Most common words (real corpus rank) first; unranked words last
      orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    })

  let newWords = (await drawNewWords(levelFilter)).filter(isEligible).slice(0, newWordsTarget)
  // A level near the top of the pair can exhaust its band — fall back to the
  // whole vocabulary rather than serve a half-empty session
  if (newWords.length < newWordsTarget && level) {
    newWords = (await drawNewWords({})).filter(isEligible).slice(0, newWordsTarget)
  }

  // 3. Create session record
  const studySession = await db.studySession.create({
    data: { userId },
  })

  // 4. Build exercise list
  const exercises = [
    ...dueUserWords.map(uw => ({
      word: uw.word,
      userWord: uw,
      exerciseType: forcedMode ?? selectExerciseType(uw, uw.word, course, termExercises),
    })),
    ...newWords.map(w => ({
      word: w,
      userWord: null,
      exerciseType: forcedMode ?? ('FLASHCARD' as ExerciseType),
    })),
  ].slice(0, SESSION_SIZE)

  // Shuffle
  for (let i = exercises.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[exercises[i], exercises[j]] = [exercises[j], exercises[i]]
  }

  // Pre-compute QCM distractors in one query (avoids a network round trip per question)
  const answerField = promptLang(direction) === pairOf(pair).term ? ('translation' as const) : ('term' as const)
  const distractorsByWordId = new Map<string, string[]>()
  const DISTRACTOR_POOL_SIZE = 150
  if (exercises.some(e => e.exerciseType === 'QCM')) {
    // Random window into the pair's vocabulary — bounded by its actual size, or a
    // small pair would be skipped past entirely and yield no distractors
    const pairTotal = await db.word.count({ where: { pair, studyable: true } })
    const pool = await db.word.findMany({
      where: { pair, studyable: true, id: { notIn: exercises.map(e => e.word.id) } },
      select: { term: true, translation: true, wordType: true },
      take: DISTRACTOR_POOL_SIZE,
      skip: Math.floor(Math.random() * Math.max(1, pairTotal - DISTRACTOR_POOL_SIZE)),
    })
    for (const ex of exercises) {
      if (ex.exerciseType !== 'QCM') continue
      const sameType = pool.filter(p => p.wordType === ex.word.wordType)
      const source = sameType.length >= 3 ? sameType : pool
      const correct = ex.word[answerField]
      const options = [...new Set(source.map(p => p[answerField]).filter(v => v && v !== correct))]
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[options[i], options[j]] = [options[j], options[i]]
      }
      distractorsByWordId.set(ex.word.id, options.slice(0, 3))
    }
  }

  // Answers that produce the term can be right without being the stored word:
  // shown "crier, aboyer", a learner writes "bark" where the entry says "bay".
  // Every word of the pair sharing a sense is collected as an accepted answer.
  const producesTerm = answerField === 'term'
  const alsoAcceptedByWordId = new Map<string, string[]>()
  const needsAlternatives = exercises.filter(
    e => producesTerm || e.exerciseType === 'CLOZE',
  )
  if (needsAlternatives.length > 0) {
    const senses = [...new Set(needsAlternatives.flatMap(e => glossSenses(e.word.translation)))]
    const candidates = senses.length > 0
      ? await db.word.findMany({
          where: {
            pair,
            studyable: true,
            id: { notIn: needsAlternatives.map(e => e.word.id) },
            OR: senses.map(sense => ({ translation: { contains: sense, mode: 'insensitive' as const } })),
          },
          select: { term: true, translation: true, wordType: true },
        })
      : []
    for (const ex of needsAlternatives) {
      const matches = candidates
        .filter(c => c.wordType === ex.word.wordType && glossesOverlap(c.translation, ex.word.translation))
        .map(c => c.term)
      if (matches.length > 0) alsoAcceptedByWordId.set(ex.word.id, [...new Set(matches)].slice(0, 12))
    }
  }

  return NextResponse.json({
    sessionId: studySession.id,
    exercises: exercises.map(e => ({
      ...e,
      distractors: distractorsByWordId.get(e.word.id),
      alsoAccepted: alsoAcceptedByWordId.get(e.word.id),
    })),
  })
}
