// One answer: the SM-2 update for the word in this direction, plus the running
// counters of the session it belongs to. A duel round records its answers here
// too — a duel is real revision, so it moves the schedule like any session.
import { db } from '@/lib/db'
import { sm2Update, qualityFromResult } from '@/lib/sm2'
import type { Direction } from '@/lib/courses'
import type { AnswerResult } from '@/types'

export interface RecordedAnswer {
  wordId: string
  result: AnswerResult
  direction: Direction
  sessionId: string
}

export async function recordAnswer(userId: string, { wordId, result, direction, sessionId }: RecordedAnswer) {
  const existing = await db.userWord.findUnique({
    where: { userId_wordId_direction: { userId, wordId, direction } },
  })

  const quality = qualityFromResult(result)
  const currentState = existing ?? { easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: new Date() }
  const newState = sm2Update(currentState, quality)

  const userWord = await db.userWord.upsert({
    where: { userId_wordId_direction: { userId, wordId, direction } },
    create: {
      userId, wordId, direction,
      ...newState,
      correctCount: result === 'correct' ? 1 : 0,
      incorrectCount: result === 'incorrect' ? 1 : 0,
      approxCount: result === 'approximate' ? 1 : 0,
      lastResult: result,
      lastStudied: new Date(),
    },
    update: {
      ...newState,
      correctCount: result === 'correct' ? { increment: 1 } : undefined,
      incorrectCount: result === 'incorrect' ? { increment: 1 } : undefined,
      approxCount: result === 'approximate' ? { increment: 1 } : undefined,
      lastResult: result,
      lastStudied: new Date(),
    },
  })

  await db.studySession.update({
    where: { id: sessionId },
    data: {
      wordsStudied: { increment: 1 },
      wordsCorrect: result === 'correct' ? { increment: 1 } : undefined,
      wordsApprox: result === 'approximate' ? { increment: 1 } : undefined,
    },
  })

  return userWord
}
