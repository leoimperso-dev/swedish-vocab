import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse, getCourseWithLevel } from '@/lib/current-course'
import { buildExercises } from '@/lib/study/build'
import { recordAnswer } from '@/lib/study/answer'
import { finalizeSession } from '@/lib/study/finalize'
import { courseDirections, defaultDirection, type Course, type Direction } from '@/lib/courses'
import { BLITZ_SECONDS, DUEL_MESSAGE_MAX, DUEL_XP, ROUND_SIZE, scoreAnswer, type DuelMode } from '@/lib/duel/rules'
import { isParticipant, opponentOf, submitRound } from '@/lib/duel/service'
import type { AnswerResult, ExerciseType } from '@/types'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * The direction this player answers in.
 *
 * Two learners of the same pair share the direction the challenger picked, so
 * the duel is symmetrical. Across pairs there is no shared direction at all —
 * a French speaker learning Swedish and a Dutch learner have no language in
 * common to translate between — so each falls back to their own course. Every
 * player always drills the language they are actually learning.
 */
function directionForPlayer(course: Course, agreed: string): Direction {
  return courseDirections(course).find(d => d === agreed) ?? defaultDirection(course)
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
  const direction = directionForPlayer(course, duel.direction)

  const exercises = await buildExercises({
    userId,
    course,
    level,
    direction,
    size: ROUND_SIZE,
    // A duel never asks for new words on purpose: the DUEL policy fills the
    // round with revision and only falls back to unseen words for a beginner
    // who has none yet.
    newWords: 0,
    policy: 'DUEL',
    // Blitz also flips the translation direction at random, exercise by
    // exercise, so nobody settles into one-way reflexes
    flipDirections: duel.mode === 'BLITZ',
  })

  const studySession = await db.studySession.create({ data: { userId } })
  // Named here so the summary screen can address the note to someone
  const opponent = await db.user.findUnique({
    where: { id: opponentOf(duel, userId) },
    select: { name: true },
  })

  return NextResponse.json({
    sessionId: studySession.id,
    round,
    mode: duel.mode as DuelMode,
    direction,
    exercises,
    opponentName: opponent?.name ?? null,
  })
}

interface SubmitBody {
  sessionId: string
  /** One entry per exercise, in the order they were answered. */
  answers: Array<{
    wordId: string
    result: AnswerResult
    msLeft?: number
    direction?: string
    /** Which blitz clock `msLeft` was measured against — see scoreAnswer. */
    exerciseType?: string
  }>
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
  const course = await getCourse(userId)
  const roundDirection = directionForPlayer(course, duel.direction)
  // A blitz round mixes both directions, so each answer reports its own. It is
  // only ever accepted as one of this player's two — a wrong value would
  // credit SM-2 to a direction their course does not even have.
  // Blitz gives each exercise type its own clock, so the reported time only
  // means something alongside the type it was measured against. The round's
  // exercises are not stored, so this is taken on trust — like msLeft itself,
  // and no more exploitable: a full clock already pays the maximum bonus
  // whichever type is claimed.
  const exerciseTypeOf = (reported: string | undefined): ExerciseType =>
    reported && reported in BLITZ_SECONDS ? (reported as ExerciseType) : 'QCM'

  const ownDirections = courseDirections(course)
  const directionOf = (reported: string | undefined): Direction =>
    ownDirections.find(d => d === reported) ?? roundDirection

  // The score is recomputed here, never taken from the client: the browser only
  // reports what was answered and how much clock was left.
  let score = 0
  let streak = 0
  let bestCombo = 0
  const results: AnswerResult[] = []
  for (const answer of answers) {
    streak = answer.result === 'correct' ? streak + 1 : 0
    bestCombo = Math.max(bestCombo, streak)
    score += scoreAnswer(mode, answer.result, {
      streak,
      msLeft: answer.msLeft ?? 0,
      exerciseType: exerciseTypeOf(answer.exerciseType),
    })
    results.push(answer.result)
  }

  // SM-2, exactly as in a solo session
  for (const answer of answers) {
    await recordAnswer(userId, {
      wordId: answer.wordId,
      result: answer.result,
      direction: directionOf(answer.direction),
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

/**
 * Attaches a note to a round the caller has played.
 *
 * Separate from the submission on purpose: the round is banked first, so
 * closing the tab at the summary screen costs the note and never the score.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const body = (await req.json()) as { round?: unknown; message?: unknown }
  if (typeof body.round !== 'number' || !Number.isInteger(body.round)) {
    return NextResponse.json({ error: 'round must be an integer' }, { status: 400 })
  }
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, DUEL_MESSAGE_MAX) : ''

  // updateMany rather than update: the caller's id is part of the filter, so a
  // round belonging to anyone else simply matches nothing
  const { count } = await db.duelRound.updateMany({
    where: { duelId: id, userId, round: body.round },
    data: { message: text || null },
  })
  if (count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
