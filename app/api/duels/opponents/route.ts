import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { resolveCourse } from '@/lib/courses'

/** Everyone this user can challenge, with the language each of them studies. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Anyone can be challenged, whatever they are learning: each player answers
  // in their own course, so a Swedish learner and a Dutch learner still get a
  // comparable ten exercises each.
  const users = await db.user.findMany({
    where: { id: { not: session.user.id } },
    select: { id: true, name: true, image: true, xp: true, nativeLanguage: true, learningLanguage: true },
    orderBy: { xp: 'desc' },
    take: 100,
  })

  const opponents = users.map(u => ({
    id: u.id,
    name: u.name,
    image: u.image,
    xp: u.xp,
    // Shown in the picker, so it is clear what the other side will be drilling
    learning: resolveCourse(u.nativeLanguage, u.learningLanguage).learned,
  }))

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
