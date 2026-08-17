import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import { courseDirections, defaultDirection, resolveCourse, type Direction } from '@/lib/courses'
import { isDuelMode, roundsCount } from '@/lib/duel/rules'
import { listDuels } from '@/lib/duel/service'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ duels: await listDuels(session.user.id) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { opponentId, mode, rounds, direction: requested } = await req.json()
  if (typeof opponentId !== 'string' || opponentId === userId) {
    return NextResponse.json({ error: 'Invalid opponent' }, { status: 400 })
  }

  const course = await getCourse(userId)
  const opponent = await db.user.findUnique({
    where: { id: opponentId },
    select: { nativeLanguage: true, learningLanguage: true },
  })
  if (!opponent) return NextResponse.json({ error: 'Unknown opponent' }, { status: 404 })

  // Both play on the same content, each on their own words: the same pair is
  // the only requirement — their CEFR levels can differ freely.
  if (resolveCourse(opponent.nativeLanguage, opponent.learningLanguage).pair !== course.pair) {
    return NextResponse.json({ error: 'Different course' }, { status: 400 })
  }

  // One running duel per opponent, so the list stays readable
  const running = await db.duel.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { challengerId: userId, opponentId },
        { challengerId: opponentId, opponentId: userId },
      ],
    },
  })
  if (running) return NextResponse.json({ duel: { id: running.id }, existing: true })

  const direction: Direction = courseDirections(course).find(d => d === requested)
    ?? defaultDirection(course)

  const duel = await db.duel.create({
    data: {
      pair: course.pair,
      direction,
      mode: isDuelMode(mode) ? mode : 'CLASSIC',
      rounds: roundsCount(rounds),
      challengerId: userId,
      opponentId,
      // The challenger opens: playing round 1 is what sends the challenge, so
      // the opponent is only disturbed once there is something to answer.
      turnUserId: userId,
    },
  })

  return NextResponse.json({ duel: { id: duel.id }, existing: false })
}
