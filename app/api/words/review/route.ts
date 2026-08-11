import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import { courseDirections } from '@/lib/courses'
import { sm2Update, knowledgeLevel } from '@/lib/sm2'
import { getLevelForXp, XP_REWARDS } from '@/lib/xp'

// Quick self-assessment from the vocabulary list (swipe right = I know it,
// swipe left = I don't). Feeds the same SM-2 progression as a study session —
// in both directions of the course, since the claim is direction-agnostic —
// and awards the plain per-word XP. No streak, no combos, no daily bonus.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { wordId, known } = await req.json()
  if (typeof wordId !== 'string' || typeof known !== 'boolean') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const course = await getCourse(userId)
  const word = await db.word.findUnique({ where: { id: wordId }, select: { pair: true } })
  if (!word || word.pair !== course.pair) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const quality = known ? 4 : 0
  const states = []
  for (const direction of courseDirections(course)) {
    const existing = await db.userWord.findUnique({
      where: { userId_wordId_direction: { userId, wordId, direction } },
    })
    const current = existing ?? { easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: new Date() }
    const next = sm2Update(current, quality)
    await db.userWord.upsert({
      where: { userId_wordId_direction: { userId, wordId, direction } },
      create: {
        userId, wordId, direction,
        ...next,
        correctCount: known ? 1 : 0,
        incorrectCount: known ? 0 : 1,
        lastResult: known ? 'correct' : 'incorrect',
        lastStudied: new Date(),
      },
      update: {
        ...next,
        correctCount: known ? { increment: 1 } : undefined,
        incorrectCount: known ? undefined : { increment: 1 },
        lastResult: known ? 'correct' : 'incorrect',
        lastStudied: new Date(),
      },
    })
    states.push(next)
  }

  let xp: number | undefined
  if (known) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { xp: true } })
    xp = (user?.xp ?? 0) + XP_REWARDS.correct
    await db.user.update({
      where: { id: userId },
      data: { xp, level: getLevelForXp(xp).level },
    })
  }

  return NextResponse.json({
    known,
    level: Math.max(...states.map(s => knowledgeLevel(s.interval))),
    xp,
  })
}
