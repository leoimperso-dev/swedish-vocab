// "I already know these perfectly" — bulk-sets a selection of words to the top
// of the knowledge ladder, in both directions of the course.
//
// Deliberately awards no XP, unlike the swipe self-assessment: a claim over
// hundreds of words at once would mint more XP in one tap than a month of
// sessions. The point is to stop being asked these words, not to score.
import { db } from '@/lib/db'
import { courseDirections, type Course } from '@/lib/courses'
import { MASTERED_STATE } from '@/lib/sm2'

/** One request can carry a whole tab; past this the payload is a mistake. */
export const MAX_MASTERED_PER_CALL = 1000

export async function markMastered(
  userId: string,
  course: Course,
  requestedIds: string[],
): Promise<number> {
  // Only words of the course being studied — an id from another pair would
  // create progression the vocabulary list never shows
  const wordIds = (
    await db.word.findMany({
      where: { id: { in: requestedIds }, pair: course.pair },
      select: { id: true },
    })
  ).map(w => w.id)
  if (wordIds.length === 0) return 0

  const directions = [...courseDirections(course)]
  const state = MASTERED_STATE()
  const now = new Date()

  // Two statements rather than an upsert per word per direction: a tidy-up
  // pass over a whole category is hundreds of rows.
  await db.userWord.updateMany({
    where: { userId, wordId: { in: wordIds }, direction: { in: directions } },
    data: { ...state, lastResult: 'correct', lastStudied: now },
  })
  const existing = await db.userWord.findMany({
    where: { userId, wordId: { in: wordIds }, direction: { in: directions } },
    select: { wordId: true, direction: true },
  })
  const seen = new Set(existing.map(row => `${row.wordId}|${row.direction}`))
  const missing = wordIds.flatMap(wordId =>
    directions
      .filter(direction => !seen.has(`${wordId}|${direction}`))
      .map(direction => ({
        userId, wordId, direction,
        ...state,
        correctCount: 1,
        lastResult: 'correct',
        lastStudied: now,
      })),
  )
  if (missing.length > 0) await db.userWord.createMany({ data: missing, skipDuplicates: true })

  return wordIds.length
}
