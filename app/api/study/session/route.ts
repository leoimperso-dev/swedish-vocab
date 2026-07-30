import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import type { ExerciseType } from '@/types'
import type { Word, UserWord } from '@prisma/client'

const SESSION_SIZE = 15
const NEW_WORDS_PER_SESSION = 5
const FORCED_MODES: ExerciseType[] = ['FLASHCARD', 'QCM', 'TYPING', 'CONJUGATION', 'CLOZE']

function hasFullVerbForms(forms: unknown): boolean {
  if (!forms || typeof forms !== 'object') return false
  const f = forms as Record<string, unknown>
  return ['present', 'preterit', 'supine'].every(k => typeof f[k] === 'string' && f[k])
}

function hasExamples(examples: unknown): boolean {
  return Array.isArray(examples) && examples.length > 0
}

function selectExerciseType(userWord: UserWord | null, word: Word, frNative: boolean): ExerciseType {
  if (!userWord || userWord.repetitions === 0) return 'FLASHCARD'
  if (userWord.repetitions <= 2) return 'QCM'
  // Conjugation and cloze work on Swedish material — only for French speakers learning Swedish
  const pool: ExerciseType[] = ['TYPING']
  if (frNative && word.wordType === 'VERB' && hasFullVerbForms(word.forms)) pool.push('CONJUGATION')
  if (frNative && hasExamples(word.examples)) pool.push('CLOZE')
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const user = await db.user.findUnique({ where: { id: userId }, select: { nativeLanguage: true } })
  const canConjugate = user?.nativeLanguage !== 'sv'

  const modeParam = req.nextUrl.searchParams.get('mode') as ExerciseType | null
  const frNativeOnly = modeParam === 'CONJUGATION' || modeParam === 'CLOZE'
  const forcedMode = modeParam && FORCED_MODES.includes(modeParam) && (!frNativeOnly || canConjugate)
    ? modeParam
    : null

  // Conjugation needs verbs with complete forms; cloze needs example sentences (checked in JS below)
  const conjugationOnly = forcedMode === 'CONJUGATION'
  const clozeOnly = forcedMode === 'CLOZE'
  const needsEligibility = conjugationOnly || clozeOnly
  const isEligible = (word: Word) =>
    conjugationOnly ? hasFullVerbForms(word.forms) : clozeOnly ? hasExamples(word.examples) : true
  const wordFilter = conjugationOnly ? { wordType: 'VERB' as const } : {}

  // 1. Due words (SM-2 scheduled for today)
  const dueUserWords = (await db.userWord.findMany({
    where: { userId, nextReview: { lte: new Date() }, word: wordFilter },
    include: { word: true },
    orderBy: { nextReview: 'asc' },
    take: needsEligibility ? SESSION_SIZE * 3 : SESSION_SIZE - NEW_WORDS_PER_SESSION,
  }))
    .filter(uw => isEligible(uw.word))
    .slice(0, SESSION_SIZE - NEW_WORDS_PER_SESSION)

  // 2. New words (never studied)
  const studiedWordIds = await db.userWord.findMany({
    where: { userId },
    select: { wordId: true },
  })
  const studiedIds = studiedWordIds.map(uw => uw.wordId)

  const newWordsTarget = Math.max(NEW_WORDS_PER_SESSION, SESSION_SIZE - dueUserWords.length)
  const newWords = (await db.word.findMany({
    where: { id: { notIn: studiedIds }, ...wordFilter },
    take: needsEligibility ? newWordsTarget * 3 : newWordsTarget,
    // Most common words (real corpus rank) first; unranked words last
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  }))
    .filter(w => isEligible(w))
    .slice(0, newWordsTarget)

  // 3. Create session record
  const studySession = await db.studySession.create({
    data: { userId },
  })

  // 4. Build exercise list
  const exercises = [
    ...dueUserWords.map(uw => ({
      word: uw.word,
      userWord: uw,
      exerciseType: forcedMode ?? selectExerciseType(uw, uw.word, canConjugate),
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

  return NextResponse.json({ sessionId: studySession.id, exercises })
}
