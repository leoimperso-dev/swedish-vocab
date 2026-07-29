import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import type { ExerciseType } from '@/types'
import type { Word, UserWord } from '@prisma/client'

const SESSION_SIZE = 15
const NEW_WORDS_PER_SESSION = 5

function selectExerciseType(userWord: UserWord | null, word: Word): ExerciseType {
  if (!userWord || userWord.repetitions === 0) return 'FLASHCARD'
  if (userWord.repetitions <= 2) return 'QCM'
  if (word.wordType === 'VERB' && word.forms) return Math.random() > 0.5 ? 'CONJUGATION' : 'TYPING'
  return 'TYPING'
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // 1. Due words (SM-2 scheduled for today)
  const dueUserWords = await db.userWord.findMany({
    where: { userId, nextReview: { lte: new Date() } },
    include: { word: true },
    orderBy: { nextReview: 'asc' },
    take: SESSION_SIZE - NEW_WORDS_PER_SESSION,
  })

  // 2. New words (never studied)
  const studiedWordIds = await db.userWord.findMany({
    where: { userId },
    select: { wordId: true },
  })
  const studiedIds = studiedWordIds.map(uw => uw.wordId)

  const newWords = await db.word.findMany({
    where: { id: { notIn: studiedIds } },
    take: Math.max(NEW_WORDS_PER_SESSION, SESSION_SIZE - dueUserWords.length),
    // Most common words (real corpus rank) first; unranked words last
    orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })

  // 3. Create session record
  const studySession = await db.studySession.create({
    data: { userId },
  })

  // 4. Build exercise list
  const exercises = [
    ...dueUserWords.map(uw => ({
      word: uw.word,
      userWord: uw,
      exerciseType: selectExerciseType(uw, uw.word),
    })),
    ...newWords.map(w => ({
      word: w,
      userWord: null,
      exerciseType: 'FLASHCARD' as ExerciseType,
    })),
  ].slice(0, SESSION_SIZE)

  // Shuffle
  for (let i = exercises.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[exercises[i], exercises[j]] = [exercises[j], exercises[i]]
  }

  return NextResponse.json({ sessionId: studySession.id, exercises })
}
