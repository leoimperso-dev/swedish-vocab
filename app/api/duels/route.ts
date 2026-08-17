import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import { courseDirections, defaultDirection, type Direction } from '@/lib/courses'
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
  const opponent = await db.user.findUnique({ where: { id: opponentId }, select: { id: true } })
  if (!opponent) return NextResponse.json({ error: 'Unknown opponent' }, { status: 404 })

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
      // The challenger's own pair and direction. Each player is served their
      // own course at round time, so these only bind the opponent when they
      // happen to study the same pair — see app/api/duels/[id]/round.
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
