// Studying without a network: the downloaded pool of exercises, and the answers
// waiting to reach the server.
import { STORES, clear, count, getAll, offlineStorageAvailable, putAll, remove } from '@/lib/offline/db'
import type { Direction } from '@/lib/courses'
import type { AnswerResult, ExerciseType, ExerciseWord } from '@/types'

export interface PooledExercise {
  id?: number
  pair: string
  direction: Direction
  exercise: ExerciseWord
}

export interface QueuedAnswer {
  id?: number
  wordId: string
  result: AnswerResult
  direction: Direction
  exerciseType: string
  /** ISO timestamp of the moment the learner answered — see recordAnswer. */
  answeredAt: string
  /** Groups the answers of one offline session, so the server can close it as one. */
  batch: string
  /** Longest run of correct answers in that session, for the XP bonus. */
  bestCombo: number
}

export async function poolSize(pair: string): Promise<number> {
  if (!offlineStorageAvailable()) return 0
  const rows = await getAll<PooledExercise>(STORES.pool)
  return rows.filter(row => row.pair === pair).length
}

/** Replaces the pool: a stale exercise is worse than none, the schedule moved on. */
export async function fillPool(pair: string, direction: Direction, exercises: ExerciseWord[]): Promise<void> {
  if (!offlineStorageAvailable()) return
  await clear(STORES.pool)
  await putAll<PooledExercise>(
    STORES.pool,
    exercises.map(exercise => ({ pair, direction, exercise })),
  )
}

/**
 * Takes `size` exercises out of the pool — they are consumed, not borrowed.
 *
 * A forced type is honoured as far as the pool allows. FLASHCARD always works:
 * any word can be shown as one, since a flashcard needs nothing beyond the word
 * itself — it is the mode to reach for with no network. The others are served
 * from the pooled exercises of that type, topped up with whatever is left
 * rather than refusing to start a session.
 */
export async function drawFromPool(
  pair: string,
  size: number,
  forcedType?: ExerciseType | null,
): Promise<ExerciseWord[]> {
  if (!offlineStorageAvailable()) return []
  const rows = (await getAll<PooledExercise>(STORES.pool)).filter(row => row.pair === pair)

  let chosen: PooledExercise[]
  if (forcedType && forcedType !== 'FLASHCARD') {
    const matching = rows.filter(row => row.exercise.exerciseType === forcedType)
    chosen = [...matching, ...rows.filter(row => !matching.includes(row))].slice(0, size)
  } else {
    chosen = rows.slice(0, size)
  }

  await remove(STORES.pool, chosen.map(row => row.id!).filter(id => id !== undefined))
  return chosen.map(row =>
    forcedType === 'FLASHCARD' ? { ...row.exercise, exerciseType: 'FLASHCARD' as const } : row.exercise,
  )
}

export async function queueAnswer(answer: Omit<QueuedAnswer, 'id'>): Promise<void> {
  if (!offlineStorageAvailable()) return
  await putAll<Omit<QueuedAnswer, 'id'>>(STORES.queue, [answer])
}

export async function pendingAnswers(): Promise<number> {
  if (!offlineStorageAvailable()) return 0
  return count(STORES.queue)
}

/**
 * Sends everything that was answered offline, oldest first, and clears what the
 * server accepted.
 *
 * Answers are grouped per offline session so each becomes one StudySession —
 * merging them would inflate a single session's combo and XP.
 */
export async function flushQueue(): Promise<number> {
  if (!offlineStorageAvailable()) return 0
  const rows = await getAll<QueuedAnswer>(STORES.queue)
  if (rows.length === 0) return 0

  const batches = new Map<string, QueuedAnswer[]>()
  for (const row of rows) batches.set(row.batch, [...(batches.get(row.batch) ?? []), row])

  const res = await fetch('/api/study/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batches: [...batches.entries()].map(([batch, answers]) => ({
        batch,
        bestCombo: Math.max(...answers.map(a => a.bestCombo)),
        answers: answers.map(({ wordId, result, direction, exerciseType, answeredAt }) => ({
          wordId, result, direction, exerciseType, answeredAt,
        })),
      })),
    }),
  })
  // Anything short of a confirmed write stays queued: losing a day of revision
  // silently is worse than sending it twice, and the server is idempotent per
  // batch id.
  if (!res.ok) return 0
  await remove(STORES.queue, rows.map(row => row.id!).filter(id => id !== undefined))
  return rows.length
}
