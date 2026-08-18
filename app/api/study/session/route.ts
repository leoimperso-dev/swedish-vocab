import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourseWithLevel } from '@/lib/current-course'
import { buildExercises, EXPRESSIONS_CATEGORY } from '@/lib/study/build'
import { asDirectionChoice, learnsTermLanguage } from '@/lib/courses'
import type { ExerciseType } from '@/types'

const SESSION_SIZE = 15
const NEW_WORDS_PER_SESSION = 5
const FORCED_MODES: ExerciseType[] = ['FLASHCARD', 'QCM', 'TYPING', 'CONJUGATION', 'CLOZE', 'LISTENING']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { course, level } = await getCourseWithLevel(userId)
  // Conjugation and cloze drill the pair's `term` language: only its learners get them
  const termExercises = learnsTermLanguage(course)

  const direction = asDirectionChoice(course, req.nextUrl.searchParams.get('direction'))
  const modeParam = req.nextUrl.searchParams.get('mode') as ExerciseType | null
  const termOnlyMode = modeParam === 'CONJUGATION' || modeParam === 'CLOZE'
  const forcedMode = modeParam && FORCED_MODES.includes(modeParam) && (!termOnlyMode || termExercises)
    ? modeParam
    : null

  // Expressions are learned as blocks, so they get a session of their own
  // instead of being buried among ordinary headwords
  const expressionsOnly = req.nextUrl.searchParams.get('scope') === 'expressions'

  const exercises = await buildExercises({
    userId,
    course,
    level,
    direction,
    size: SESSION_SIZE,
    newWords: NEW_WORDS_PER_SESSION,
    forcedMode,
    category: expressionsOnly ? EXPRESSIONS_CATEGORY : undefined,
  })

  const studySession = await db.studySession.create({ data: { userId } })

  return NextResponse.json({ sessionId: studySession.id, exercises })
}
