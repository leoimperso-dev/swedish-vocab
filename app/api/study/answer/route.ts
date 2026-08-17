import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { recordAnswer } from '@/lib/study/answer'
import { finalizeSession } from '@/lib/study/finalize'
import { isDirection, DEFAULT_COURSE, defaultDirection } from '@/lib/courses'
import type { AnswerPayload } from '@/types'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: AnswerPayload = await req.json()
  const direction = isDirection(body.direction) ? body.direction : defaultDirection(DEFAULT_COURSE)

  const userWord = await recordAnswer(session.user.id, {
    wordId: body.wordId,
    result: body.result,
    direction,
    sessionId: body.sessionId,
  })

  return NextResponse.json({ userWord })
}

export async function PUT(req: NextRequest) {
  // Called at end of session to finalize XP, streak, achievements
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, results, bestCombo } = await req.json()
  const outcome = await finalizeSession(session.user.id, sessionId, results, bestCombo)
  if (!outcome) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json(outcome)
}
