// Building a list of exercises for one player: which words, which exercise on
// each, and the extra data an exercise needs (QCM distractors, accepted
// alternatives). Shared by the solo session route and by a duel round — a duel
// round is a normal session, minus the flashcard.
import { db } from '@/lib/db'
import { levelsAtOrAbove, reviewPriority, type CefrLevel } from '@/lib/cefr'
import { answerableExamples } from '@/lib/cloze'
import { glossSenses, glossesOverlap } from '@/lib/gloss'
import {
  courseDirections, learnsTermLanguage, pairOf, promptLang, verbFormsFor,
  type Course, type Direction, type DirectionChoice,
} from '@/lib/courses'
import { assignDuelTypes } from '@/lib/duel/mix'
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

// How a MIX session spreads its exercise types, hardest last.
//
// Chosen per word, the type followed the word's own progression — a flashcard
// until it had been answered, a QCM until three repetitions. That reads well
// for one card and collapses for a session: a learner's list is mostly new
// words, so every card came out a flashcard and MIX drilled a single type. The
// quotas are dealt over the session instead, and it is the *ranking* that keeps
// the progression: the easiest slots go to the least-known words.
const SOLO_MIX: ExerciseType[] = [
  'FLASHCARD', 'FLASHCARD', 'FLASHCARD', 'FLASHCARD',
  'QCM', 'QCM', 'QCM', 'QCM',
  'LISTENING', 'LISTENING', 'LISTENING',
  'TYPING', 'TYPING', 'TYPING', 'TYPING',
]
// Difficulty order of the slots above; the same order ranks the words
const SOLO_DIFFICULTY: ExerciseType[] = ['FLASHCARD', 'QCM', 'LISTENING', 'TYPING']
// At most this many typing slots become their richer variant (cloze/conjugation)
const SOLO_VARIANT_SLOTS = 2

interface SoloCandidate {
  userWord: UserWord | null
  word: Word
}

/** Solo policy: quotas over the session, easiest slots to the least-known words. */
function assignSoloTypes(
  candidates: SoloCandidate[],
  course: Course,
  termExercises: boolean,
): ExerciseType[] {
  const slots: ExerciseType[] = []
  while (slots.length < candidates.length) slots.push(...SOLO_MIX)
  slots.length = candidates.length
  slots.sort((a, b) => SOLO_DIFFICULTY.indexOf(a) - SOLO_DIFFICULTY.indexOf(b))

  const order = candidates
    .map((candidate, i) => ({ i, repetitions: candidate.userWord?.repetitions ?? -1 }))
    .sort((a, b) => a.repetitions - b.repetitions)

  const types: ExerciseType[] = new Array(candidates.length)
  order.forEach(({ i }, rank) => { types[i] = slots[rank] })

  // A typing slot becomes cloze or conjugation where the word allows it, so a
  // session is not four identical prompts in a row.
  let variants = 0
  for (let i = 0; i < candidates.length && variants < SOLO_VARIANT_SLOTS; i++) {
    if (types[i] !== 'TYPING' || !termExercises) continue
    const { word } = candidates[i]
    if (word.wordType === 'VERB' && hasFullVerbForms(word.forms, course)) types[i] = 'CONJUGATION'
    else if (clozeEligible(word)) types[i] = 'CLOZE'
    else continue
    variants++
  }

  return types
}

/** Filter keeping the first row of each word — one card per word per session. */
function uniqueWords(): (uw: { wordId: string }) => boolean {
  const seen = new Set<string>()
  return uw => (seen.has(uw.wordId) ? false : (seen.add(uw.wordId), true))
}

/**
 * Exercises whose answer *is* the language being learned, whatever the card's
 * schedule says: a dictation is heard and typed in that language, a cloze fills
 * a sentence written in it, a conjugation types its verb forms.
 */
const PRODUCES_LEARNED: readonly ExerciseType[] = ['LISTENING', 'CLOZE', 'CONJUGATION']

/**
 * Which way round one exercise is asked.
 *
 * Two rules, both about never making the learner produce their own language by
 * accident:
 * - an exercise that can only produce the learned language always carries the
 *   direction that ends there. Left on a `learned → native` card it credited
 *   the wrong SM-2 schedule — the learner typed English and the French
 *   progression moved.
 * - blitz only flips multiple choice. Flipping a typing exercise asked the
 *   learner to *write* in their own language, which drills nothing; picking a
 *   translation out of four options is a fair drill in either direction.
 */
function exerciseDirection(
  exerciseType: ExerciseType,
  own: Direction,
  bothWays: [Direction, Direction],
  flip: boolean,
): Direction {
  // courseDirections is native-first, so [0] is the one answering in the learned language
  if (PRODUCES_LEARNED.includes(exerciseType)) return bothWays[0]
  if (flip && exerciseType === 'QCM') return bothWays[Math.floor(Math.random() * bothWays.length)]
  return own
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
  /**
   * One direction for the whole session, or 'MIXED' to draw each card in the
   * direction it is scheduled in — see the mixed handling in buildExercises.
   */
  direction: DirectionChoice
  size: number
  newWords: number
  /** Single exercise type for the whole list (solo mode picker). */
  forcedMode?: ExerciseType | null
  /**
   * SOLO teaches: it fills a short session with new words and eases the learner
   * in with a flashcard. DUEL scores: it caps new words at `newWords`, tops the
   * round up with vocabulary already met, and deals types from fixed quotas —
   * see lib/duel/mix.ts for why.
   */
  policy?: 'SOLO' | 'DUEL'
  /**
   * Pick each exercise's direction at random among the course's two, instead of
   * using `direction` throughout. Blitz duels do this: being asked "hus → ?"
   * and "maison → ?" in the same round stops the learner from settling into a
   * one-way reflex, which is a real skill gap and a good tie-breaker.
   */
  flipDirections?: boolean
}

/**
 * Due words first (SM-2 scheduled, ranked by level), topped up with never-seen
 * words drawn from the declared level and above.
 */
export async function buildExercises(opts: BuildOptions): Promise<ExerciseWord[]> {
  const { userId, course, level, direction, size, newWords: newWordsTargetBase } = opts
  const forcedMode = opts.forcedMode ?? null
  const policy = opts.policy ?? 'SOLO'
  const pair = course.pair
  // Conjugation and cloze drill the pair's `term` language: only its learners get them
  const termExercises = learnsTermLanguage(course)

  // A mixed session is not "one direction chosen at random per question": SM-2
  // keeps a separate schedule per direction, so it reviews both schedules at
  // once and each card is asked — and credited — in the direction it is
  // actually due in. Flipping a card after drawing it would advance a schedule
  // that was not the one due.
  const bothWays = courseDirections(course)
  const mixed = direction === 'MIXED'
  const directionFilter = mixed ? { in: [...bothWays] } : direction
  const fallbackDirection: Direction = mixed ? bothWays[0] : direction
  const randomDirection = () => bothWays[Math.floor(Math.random() * bothWays.length)]

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
    where: { userId, direction: directionFilter, nextReview: { lte: new Date() }, word: wordFilter },
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
    // A word due in both directions would otherwise be asked twice in one
    // session, the first question giving away the second
    .filter(uniqueWords())
    // Solo reserves seats for the new words it wants to teach; a duel gives
    // every seat it can to revision and only tops up with new words at the end.
    .slice(0, policy === 'DUEL' ? size : size - newWordsTargetBase)

  // 2. Duel only: words already met but not due yet, weakest recall first.
  //
  // Typing and dictation are the exercises that separate two players, and both
  // are unfair on a word never seen — so a duel prefers vocabulary the learner
  // has actually studied, even when nothing is scheduled for review.
  const paddingSeats = policy === 'DUEL' ? size - dueUserWords.length : 0
  const padding =
    paddingSeats > 0
      ? (
          await db.userWord.findMany({
            where: {
              userId,
              direction: directionFilter,
              nextReview: { gt: new Date() },
              wordId: { notIn: dueUserWords.map(uw => uw.wordId) },
              word: wordFilter,
            },
            include: { word: true },
            // Shakiest recall first, then the least recently seen
            orderBy: [{ lastResult: 'desc' }, { lastStudied: 'asc' }],
            take: needsEligibility ? paddingSeats * 3 : paddingSeats,
          })
        )
          .filter(uw => isEligible(uw.word))
          .filter(uniqueWords())
          .slice(0, paddingSeats)
      : []

  // 3. New words (never studied in this direction)
  const studiedWordIds = await db.userWord.findMany({
    where: { userId, direction: directionFilter },
    select: { wordId: true },
  })
  const studiedIds = studiedWordIds.map(uw => uw.wordId)

  const seatsLeft = size - dueUserWords.length - padding.length
  // Solo tops the session up with new words, because meeting new vocabulary is
  // the point. A duel takes only the seats revision could not fill — none for a
  // learner with a history, a whole round for a beginner who has none, since a
  // round of three exercises is worse than an easy one.
  const newWordsTarget = policy === 'DUEL'
    ? seatsLeft
    : Math.max(newWordsTargetBase, size - dueUserWords.length)
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

  const entries = shuffleInPlace([
    ...dueUserWords.map(uw => ({ word: uw.word, userWord: uw as UserWord })),
    ...padding.map(uw => ({ word: uw.word, userWord: uw as UserWord })),
    ...newWords.map(w => ({ word: w, userWord: null })),
  ].slice(0, size))

  const mixedTypes = forcedMode
    ? null
    : policy === 'DUEL'
      ? assignDuelTypes(
          entries.map(e => ({
            isNew: e.userWord === null,
            clozeEligible: termExercises && clozeEligible(e.word),
            conjugationEligible:
              termExercises && e.word.wordType === 'VERB' && hasFullVerbForms(e.word.forms, course),
          })),
        )
      : assignSoloTypes(entries, course, termExercises)

  const exercises = entries.map((entry, i) => {
    const exerciseType = forcedMode ?? mixedTypes![i]
    // A scheduled card is asked in its own direction; a word never seen has no
    // schedule yet, so a mixed session picks one for it.
    const own = (entry.userWord?.direction as Direction | undefined)
      ?? (mixed ? randomDirection() : fallbackDirection)
    return {
      ...entry,
      exerciseType,
      direction: exerciseDirection(exerciseType, own, bothWays, opts.flipDirections ?? false),
    }
  })

  const distractors = await buildDistractors(exercises, pair)
  const alsoAccepted = await buildAlternatives(exercises, pair)

  return exercises.map(e => ({
    ...e,
    distractors: distractors.get(e.word.id),
    alsoAccepted: alsoAccepted.get(e.word.id),
  }))
}

// Each exercise carries its own direction: a blitz round mixes both.
type Pending = { word: Word; exerciseType: ExerciseType; direction: Direction }

function answerField(pair: string, direction: Direction): 'term' | 'translation' {
  return promptLang(direction) === pairOf(pair).term ? 'translation' : 'term'
}

const DISTRACTOR_POOL_SIZE = 300
// Below this, a same-type pool cannot vary from question to question — three
// candidates shuffled are still the same three
const MIN_TYPED_DISTRACTORS = 12

/** QCM options, in one query for the whole list (no round trip per question). */
async function buildDistractors(exercises: Pending[], pair: string): Promise<Map<string, string[]>> {
  const byWordId = new Map<string, string[]>()
  if (!exercises.some(e => e.exerciseType === 'QCM')) return byWordId

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
    // Options are read on the side this exercise answers in, which can differ
    // from one question to the next in a blitz round
    const field = answerField(pair, ex.direction)
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
async function buildAlternatives(exercises: Pending[], pair: string): Promise<Map<string, string[]>> {
  const byWordId = new Map<string, string[]>()
  const needing = exercises.filter(
    e => answerField(pair, e.direction) === 'term' || e.exerciseType === 'CLOZE',
  )
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
