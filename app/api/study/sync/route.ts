import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import { courseDirections, type Direction } from '@/lib/courses'
import { recordAnswer } from '@/lib/study/answer'
import { finalizeSession } from '@/lib/study/finalize'
import type { AnswerResult } from '@/types'

// A phone that lost the network for a week still sends one batch per session;
// past this the payload is a bug, not a backlog.
const MAX_BATCHES = 50
const MAX_ANSWERS = 200

interface SyncAnswer {
  wordId: string
  result: AnswerResult
  direction: string
  answeredAt: string
}

interface SyncBatch {
  /** Client-generated id of the offline session — what makes a retry a no-op. */
  batch: string
  bestCombo: number
  answers: SyncAnswer[]
}

const RESULTS: AnswerResult[] = ['correct', 'approximate', 'incorrect']

/**
 * Replays sessions played offline.
 *
 * The phone keeps its answers until this returns 200, so the same batch can
 * arrive twice — after a timeout, or a tab closed mid-flush. `offlineBatch` is
 * unique per user, so the second attempt finds the session already recorded and
 * skips it rather than paying the XP twice.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const batches: SyncBatch[] = Array.isArray(body?.batches) ? body.batches.slice(0, MAX_BATCHES) : []
  if (batches.length === 0) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const course = await getCourse(userId)
  const ownDirections = courseDirections(course)
  const now = new Date()

  let applied = 0
  let skipped = 0
  for (const batch of batches) {
    if (typeof batch?.batch !== 'string' || !Array.isArray(batch.answers)) continue
    const answers = batch.answers
      .slice(0, MAX_ANSWERS)
      .filter(a => typeof a?.wordId === 'string' && RESULTS.includes(a.result))
    if (answers.length === 0) continue

    // Already synced: the phone retried
    const existing = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "StudySession" WHERE "userId" = ${userId} AND "offlineBatch" = ${batch.batch} LIMIT 1
    `
    if (existing.length > 0) { skipped++; continue }

    const studySession = await db.studySession.create({ data: { userId } })
    // The generated client does not know `offlineBatch` until `prisma generate`
    // runs again — set it in SQL, which the migration already created.
    await db.$executeRaw`
      UPDATE "StudySession" SET "offlineBatch" = ${batch.batch} WHERE id = ${studySession.id}
    `

    const results: AnswerResult[] = []
    for (const answer of answers) {
      // A timestamp from a device clock is not evidence: a phone set to next
      // month would schedule reviews there. Anything in the future is clamped.
      const answeredAt = new Date(answer.answeredAt)
      const at = Number.isNaN(answeredAt.getTime()) || answeredAt > now ? now : answeredAt
      const direction = (ownDirections.find(d => d === answer.direction) ?? ownDirections[0]) as Direction
      await recordAnswer(userId, {
        wordId: answer.wordId,
        result: answer.result,
        direction,
        sessionId: studySession.id,
        answeredAt: at,
      })
      results.push(answer.result)
    }

    await finalizeSession(userId, studySession.id, results, Number(batch.bestCombo) || 0)
    applied++
  }

  return NextResponse.json({ applied, skipped })
}
