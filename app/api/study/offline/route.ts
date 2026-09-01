import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCourseWithLevel } from '@/lib/current-course'
import { buildExercises } from '@/lib/study/build'
import { asDirectionChoice } from '@/lib/courses'

// Twenty sessions' worth. A long flight or a week without signal is the case
// this exists for, and the payload is still under a megabyte: an exercise is a
// word, its type, three distractors and a few accepted spellings.
const OFFLINE_SIZE = 300
const NEW_WORDS = 100

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
