// Building a list of exercises for one player: which words, which exercise on
// each, and the extra data an exercise needs (QCM distractors, accepted
// alternatives). Shared by the solo session route and by a duel round — a duel
// round is a normal session, minus the flashcard.
import { db } from '@/lib/db'
import { levelsAtOrAbove, reviewPriority, type CefrLevel } from '@/lib/cefr'
import { answerableExamples } from '@/lib/cloze'
import { glossSenses, glossesOverlap } from '@/lib/gloss'
import { learnsTermLanguage, pairOf, promptLang, verbFormsFor, type Course, type Direction } from '@/lib/courses'
import type { ExerciseType, ExerciseWord } from '@/types'
import type { Word, UserWord } from '@prisma/client'

// Due words are ranked by level in JS, so the pool has to be wider than the
// session — a learner with 174 words due needs more than the first 10 considered
const DUE_POOL_SIZE = 200

export function hasFullVerbForms(forms: unknown, course: Course): boolean {
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

export function clozeEligible(word: Word): boolean {
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
  // A duel has no flashcard: nothing self-assessed can carry a score
  allowFlashcard: boolean,
): ExerciseType {
  const early = !userWord || userWord.repetitions === 0
  if (early) return allowFlashcard ? 'FLASHCARD' : 'QCM'
  if (userWord.repetitions <= 2) return 'QCM'
  const pool: ExerciseType[] = ['TYPING']
  // Dictation always drills the learned language, whichever side it sits on
  pool.push('LISTENING')
  if (termExercises && word.wordType === 'VERB' && hasFullVerbForms(word.forms, course)) pool.push('CONJUGATION')
  if (termExercises && clozeEligible(word)) pool.push('CLOZE')
  return pool[Math.floor(Math.random() * pool.length)]
}

export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export interface BuildOptions {
  userId: string
  course: Course
  level: CefrLevel | null
  direction: Direction
  size: number
  newWords: number
  /** Single exercise type for the whole list (solo mode picker). */
  forcedMode?: ExerciseType | null
  /** False in a duel — see selectExerciseType. */
  allowFlashcard?: boolean
}

/**
 * Due words first (SM-2 scheduled, ranked by level), topped up with never-seen
 * words drawn from the declared level and above.
 */
export async function buildExercises(opts: BuildOptions): Promise<ExerciseWord[]> {
  const { userId, course, level, direction, size, newWords: newWordsTargetBase } = opts
  const forcedMode = opts.forcedMode ?? null
  const allowFlashcard = opts.allowFlashcard ?? true
  const pair = course.pair
  // Conjugation and cloze drill the pair's `term` language: only its learners get them
  const termExercises = learnsTermLanguage(course)

  // Conjugation needs verbs with complete forms; cloze needs example sentences (checked in JS below)
  const conjugationOnly = forcedMode === 'CONJUGATION'
  const clozeOnly = forcedMode === 'CLOZE'
  const needsEligibility = conjugationOnly || clozeOnly
  const isEligible = (word: Word) =>
    conjugationOnly ? hasFullVerbForms(word.forms, course) : clozeOnly ? clozeEligible(word) : true
  // studyable excludes entries that make no exercise — see scripts/mark-studyable.ts
  const wordFilter = { pair, studyable: true, ...(conjugationOnly ? { wordType: 'VERB' as const } : {}) }

  // 1. Due words (SM-2 scheduled for today, in the session's direction).
  //
  // Drawn from a wide pool and then ranked by level, because taking the oldest
  // due words first filled a B2 session with A1 pronouns: the level used to
  // gate new words only, and everything already started came back forever.
  // See reviewPriority — under-level words still compete, but only while the
  // learner is actually getting them wrong.
  const duePool = await db.userWord.findMany({
    where: { userId, direction, nextReview: { lte: new Date() }, word: wordFilter },
    include: { word: true },
    orderBy: { nextReview: 'asc' },
    take: DUE_POOL_SIZE,
  })
  const dueUserWords = duePool
    .filter(uw => isEligible(uw.word))
    .map((uw, index) => ({ uw, priority: reviewPriority(uw.word.cefr, level, uw), index }))
    // Stable within a tier: the oldest due word still comes first
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(entry => entry.uw)
    .slice(0, size - newWordsTargetBase)

  // 2. New words (never studied in this direction)
  const studiedWordIds = await db.userWord.findMany({
    where: { userId, direction },
    select: { wordId: true },
  })
  const studiedIds = studiedWordIds.map(uw => uw.wordId)

  const newWordsTarget = Math.max(newWordsTargetBase, size - dueUserWords.length)
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

  const exercises = shuffleInPlace([
    ...dueUserWords.map(uw => ({
      word: uw.word,
      userWord: uw as UserWord,
      exerciseType: forcedMode ?? selectExerciseType(uw, uw.word, course, termExercises, allowFlashcard),
    })),
    ...newWords.map(w => ({
      word: w,
      userWord: null,
      exerciseType: forcedMode ?? selectExerciseType(null, w, course, termExercises, allowFlashcard),
    })),
  ].slice(0, size))

  const distractors = await buildDistractors(exercises, pair, direction)
  const alsoAccepted = await buildAlternatives(exercises, pair, direction)

  return exercises.map(e => ({
    ...e,
    distractors: distractors.get(e.word.id),
    alsoAccepted: alsoAccepted.get(e.word.id),
  }))
}

type Pending = { word: Word; exerciseType: ExerciseType }

function answerField(pair: string, direction: Direction): 'term' | 'translation' {
  return promptLang(direction) === pairOf(pair).term ? 'translation' : 'term'
}

const DISTRACTOR_POOL_SIZE = 300
// Below this, a same-type pool cannot vary from question to question — three
// candidates shuffled are still the same three
const MIN_TYPED_DISTRACTORS = 12

/** QCM options, in one query for the whole list (no round trip per question). */
async function buildDistractors(
  exercises: Pending[],
  pair: string,
  direction: Direction,
): Promise<Map<string, string[]>> {
  const byWordId = new Map<string, string[]>()
  if (!exercises.some(e => e.exerciseType === 'QCM')) return byWordId
  const field = answerField(pair, direction)

  // Scattered sample, not a contiguous window. A window of 150 rows taken at
  // one random offset holds whatever was inserted together — often only three
  // words of a given type, so every question of that type in the session got
  // the same three distractors. ORDER BY random() over ~10k filtered rows is
  // a cheap scan and gives real variety.
  const excluded = exercises.map(e => e.word.id)
  const pool = await db.$queryRaw<Array<{ term: string; translation: string; wordType: string }>>`
    SELECT term, translation, "wordType"::text AS "wordType"
    FROM "Word"
    WHERE pair = ${pair} AND studyable = true AND id <> ALL(${excluded}::text[])
    ORDER BY random()
    LIMIT ${DISTRACTOR_POOL_SIZE}
  `
  for (const ex of exercises) {
    if (ex.exerciseType !== 'QCM') continue
    const sameType = pool.filter(p => p.wordType === ex.word.wordType)
    // Needs enough candidates to actually vary between questions, not just
    // enough to fill three slots
    const source = sameType.length >= MIN_TYPED_DISTRACTORS ? sameType : pool
    const correct = ex.word[field]
    // A distractor that means the same thing is a second right answer. Two
    // glosses of one sense are rarely the same string ("une voiture" against
    // "une voiture, une automobile"), so senses are compared, not spellings.
    const options = [...new Set(
      source
        .map(p => p[field])
        .filter(v => v && v !== correct && !(field === 'translation' && glossesOverlap(v, correct))),
    )]
    byWordId.set(ex.word.id, shuffleInPlace(options).slice(0, 3))
  }
  return byWordId
}

/**
 * Answers that produce the term can be right without being the stored word:
 * shown "crier, aboyer", a learner writes "bark" where the entry says "bay".
 * Every word of the pair sharing a sense is collected as an accepted answer.
 */
async function buildAlternatives(
  exercises: Pending[],
  pair: string,
  direction: Direction,
): Promise<Map<string, string[]>> {
  const byWordId = new Map<string, string[]>()
  const producesTerm = answerField(pair, direction) === 'term'
  const needing = exercises.filter(e => producesTerm || e.exerciseType === 'CLOZE')
  if (needing.length === 0) return byWordId

  const senses = [...new Set(needing.flatMap(e => glossSenses(e.word.translation)))]
  const candidates = senses.length > 0
    ? await db.word.findMany({
        where: {
          pair,
          studyable: true,
          id: { notIn: needing.map(e => e.word.id) },
          OR: senses.map(sense => ({ translation: { contains: sense, mode: 'insensitive' as const } })),
        },
        select: { term: true, translation: true, wordType: true },
      })
    : []
  for (const ex of needing) {
    const matches = candidates
      .filter(c => c.wordType === ex.word.wordType && glossesOverlap(c.translation, ex.word.translation))
      .map(c => c.term)
    if (matches.length > 0) byWordId.set(ex.word.id, [...new Set(matches)].slice(0, 12))
  }
  return byWordId
}
