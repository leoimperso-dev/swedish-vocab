import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import { resolveCourse } from '@/lib/courses'

/** Everyone studying the same content pair — the people this user can challenge. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const course = await getCourse(session.user.id)
  const users = await db.user.findMany({
    where: { id: { not: session.user.id } },
    select: { id: true, name: true, image: true, xp: true, nativeLanguage: true, learningLanguage: true },
    orderBy: { xp: 'desc' },
    take: 100,
  })

  const opponents = users
    .filter(u => resolveCourse(u.nativeLanguage, u.learningLanguage).pair === course.pair)
    .map(({ id, name, image, xp }) => ({ id, name, image, xp }))

  // Duels already running against them — the list shows those as "in progress"
  // rather than offering a second challenge.
  const running = await db.duel.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ challengerId: session.user.id }, { opponentId: session.user.id }],
    },
    select: { id: true, challengerId: true, opponentId: true },
  })
  const busy = Object.fromEntries(
    running.map(d => [d.challengerId === session.user!.id ? d.opponentId : d.challengerId, d.id]),
  )

  return NextResponse.json({ opponents, busy })
}
