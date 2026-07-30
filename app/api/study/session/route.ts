import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import type { ExerciseType } from '@/types'
import type { Word, UserWord } from '@prisma/client'

const SESSION_SIZE = 15
const NEW_WORDS_PER_SESSION = 5
const FORCED_MODES: ExerciseType[] = ['FLASHCARD', 'QCM', 'TYPING', 'CONJUGATION']

function hasFullVerbForms(forms: unknown): boolean {
  if (!forms || typeof forms !== 'object') return false
  const f = forms as Record<string, unknown>
  return ['present', 'preterit', 'supine'].every(k => typeof f[k] === 'string' && f[k])
}

function selectExerciseType(userWord: UserWord | null, word: Word, canConjugate: boolean): ExerciseType {
  if (!userWord || userWord.repetitions === 0) return 'FLASHCARD'
  if (userWord.repetitions <= 2) return 'QCM'
  // Conjugation drills Swedish verb forms — only for French speakers learning Swedish
  if (canConjugate && word.wordType === 'VERB' && hasFullVerbForms(word.forms)) {
    return Math.random() > 0.5 ? 'CONJUGATION' : 'TYPING'
  }
  return 'TYPING'
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const user = await db.user.findUnique({ where: { id: userId }, select: { nativeLanguage: true } })
  const canConjugate = user?.nativeLanguage !== 'sv'

  const modeParam = req.nextUrl.searchParams.get('mode') as ExerciseType | null
  const forcedMode = modeParam && FORCED_MODES.includes(modeParam) && (modeParam !== 'CONJUGATION' || canConjugate)
    ? modeParam
    : null

  // Conjugation mode only makes sense on verbs with complete forms (checked in JS below)
  const conjugationOnly = forcedMode === 'CONJUGATION'
  const wordFilter = conjugationOnly ? { wordType: 'VERB' as const } : {}

  // 1. Due words (SM-2 scheduled for today)
  const dueUserWords = (await db.userWord.findMany({
    where: { userId, nextReview: { lte: new Date() }, word: wordFilter },
    include: { word: true },
    orderBy: { nextReview: 'asc' },
    take: conjugationOnly ? SESSION_SIZE * 3 : SESSION_SIZE - NEW_WORDS_PER_SESSION,
  }))
    .filter(uw => !conjugationOnly || hasFullVerbForms(uw.word.forms))
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
    take: conjugationOnly ? newWordsTarget * 3 : newWordsTarget,
    // Most common words (real corpus rank) first; unranked words last
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  }))
    .filter(w => !conjugationOnly || hasFullVerbForms(w.forms))
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
