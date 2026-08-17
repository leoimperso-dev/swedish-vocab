import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourseWithLevel } from '@/lib/current-course'
import { buildExercises } from '@/lib/study/build'
import { recordAnswer } from '@/lib/study/answer'
import { finalizeSession } from '@/lib/study/finalize'
import { isDirection } from '@/lib/courses'
import { DUEL_XP, ROUND_NEW_WORDS, ROUND_SIZE, scoreAnswer, type DuelMode } from '@/lib/duel/rules'
import { isParticipant, submitRound } from '@/lib/duel/service'
import type { AnswerResult } from '@/types'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * Starts the caller's turn: draws their own exercises for the current round and
 * opens the StudySession the round is played as.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const duel = await db.duel.findUnique({ where: { id } })
  if (!duel || !isParticipant(duel, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (duel.status !== 'ACTIVE') return NextResponse.json({ error: 'Duel over' }, { status: 409 })
  if (duel.turnUserId !== userId) return NextResponse.json({ error: 'Not your turn' }, { status: 409 })

  const round = duel.currentRound
  const already = await db.duelRound.findUnique({
    where: { duelId_userId_round: { duelId: id, userId, round } },
  })
  if (already) return NextResponse.json({ error: 'Round already played' }, { status: 409 })

  const { course, level } = await getCourseWithLevel(userId)
  const direction = isDirection(duel.direction) ? duel.direction : undefined
  if (!direction) return NextResponse.json({ error: 'Corrupt duel' }, { status: 500 })

  const exercises = await buildExercises({
    userId,
    course,
    level,
    direction,
    size: ROUND_SIZE,
    newWords: ROUND_NEW_WORDS,
    // Nothing self-assessed can carry a score
    allowFlashcard: false,
  })

  const studySession = await db.studySession.create({ data: { userId } })

  return NextResponse.json({
    sessionId: studySession.id,
    round,
    mode: duel.mode as DuelMode,
    direction,
    exercises,
  })
}

interface SubmitBody {
  sessionId: string
  /** One entry per exercise, in the order they were answered. */
  answers: Array<{ wordId: string; result: AnswerResult; msLeft?: number }>
}

/** Ends the caller's turn: scores it, saves progress, advances the duel. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const duel = await db.duel.findUnique({ where: { id } })
  if (!duel || !isParticipant(duel, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (duel.status !== 'ACTIVE') return NextResponse.json({ error: 'Duel over' }, { status: 409 })
  if (duel.turnUserId !== userId) return NextResponse.json({ error: 'Not your turn' }, { status: 409 })

  const body: SubmitBody = await req.json()
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, ROUND_SIZE) : []
  if (answers.length === 0) return NextResponse.json({ error: 'No answers' }, { status: 400 })

  const round = duel.currentRound
  const mode = duel.mode as DuelMode
  const direction = isDirection(duel.direction) ? duel.direction : null
  if (!direction) return NextResponse.json({ error: 'Corrupt duel' }, { status: 500 })

  // The score is recomputed here, never taken from the client: the browser only
  // reports what was answered and how much clock was left.
  let score = 0
  let streak = 0
  let bestCombo = 0
  const results: AnswerResult[] = []
  for (const answer of answers) {
    streak = answer.result === 'correct' ? streak + 1 : 0
    bestCombo = Math.max(bestCombo, streak)
    score += scoreAnswer(mode, answer.result, { streak, msLeft: answer.msLeft ?? 0 })
    results.push(answer.result)
  }

  // SM-2, exactly as in a solo session
  for (const answer of answers) {
    await recordAnswer(userId, {
      wordId: answer.wordId,
      result: answer.result,
      direction,
      sessionId: body.sessionId,
    })
  }

  const outcome = await finalizeSession(userId, body.sessionId, results, bestCombo, DUEL_XP.round)

  const duelResult = await submitRound({
    duel,
    userId,
    round,
    score,
    correct: results.filter(r => r === 'correct').length,
    approx: results.filter(r => r === 'approximate').length,
    wrong: results.filter(r => r === 'incorrect').length,
    sessionId: body.sessionId,
  })

  return NextResponse.json({ ...duelResult, session: outcome })
}
