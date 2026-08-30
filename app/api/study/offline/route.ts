import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCourseWithLevel } from '@/lib/current-course'
import { buildExercises } from '@/lib/study/build'
import { asDirectionChoice } from '@/lib/courses'

// Eight sessions' worth. Enough for a week of commutes, small enough to
// download on a phone connection in one go (~1 MB with distractors).
const OFFLINE_SIZE = 120
const NEW_WORDS = 40

/**
 * The exercises the phone keeps for when there is no network.
 *
 * Same builder as a normal session, drawn once and large: an exercise arrives
 * self-contained — word, type, direction, QCM distractors, accepted answers —
 * so nothing has to be computed offline.
 *
 * The pool goes stale as the schedule moves on. That is accepted: a word
 * revised slightly early is a small cost next to not revising at all, and the
 * pool is replaced on every reconnection.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { course, level } = await getCourseWithLevel(userId)
  const direction = asDirectionChoice(course, req.nextUrl.searchParams.get('direction'))

  const exercises = await buildExercises({
    userId, course, level, direction,
    size: OFFLINE_SIZE,
    newWords: NEW_WORDS,
  })

  return NextResponse.json({ pair: course.pair, exercises })
}
