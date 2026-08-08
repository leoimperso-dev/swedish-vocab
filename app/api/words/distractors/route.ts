import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import { pairOf } from '@/lib/courses'
import type { WordType } from '@prisma/client'

const FALLBACK_WINDOW = 20

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wordId = req.nextUrl.searchParams.get('wordId')
  const wordType = req.nextUrl.searchParams.get('wordType') as WordType | null
  if (!wordId) return NextResponse.json({ error: 'Missing wordId' }, { status: 400 })

  const course = await getCourse(session.user.id)
  const pair = course.pair
  // Distractor options sit on the same side as the correct answer
  const field = req.nextUrl.searchParams.get('lang') === pairOf(pair).term
    ? ('term' as const)
    : ('translation' as const)

  // Prefer words the user has already seen (more meaningful distractors)
  const seenWordIds = await db.userWord.findMany({
    where: { userId: session.user.id, word: { pair } },
    select: { wordId: true },
    take: 200,
  })

  const distractors = await db.word.findMany({
    where: {
      pair,
      id: { not: wordId, in: seenWordIds.map(uw => uw.wordId) },
      ...(wordType ? { wordType } : {}),
    },
    select: { term: true, translation: true },
    take: 50,
    orderBy: { createdAt: 'asc' },
  })

  // Shuffle and pick 3
  const shuffled = distractors.sort(() => Math.random() - 0.5).slice(0, 3)

  // Fallback if not enough seen words
  if (shuffled.length < 3) {
    const poolTotal = await db.word.count({ where: { pair, ...(wordType ? { wordType } : {}) } })
    const fallback = await db.word.findMany({
      where: { pair, id: { not: wordId }, ...(wordType ? { wordType } : {}) },
      select: { term: true, translation: true },
      take: FALLBACK_WINDOW,
      skip: Math.floor(Math.random() * Math.max(1, poolTotal - FALLBACK_WINDOW)),
    })
    const extra = fallback
      .map(w => w[field])
      .filter(f => !shuffled.some(s => s[field] === f))
      .slice(0, 3 - shuffled.length)
    return NextResponse.json({ distractors: [...shuffled.map(w => w[field]), ...extra] })
  }

  return NextResponse.json({ distractors: shuffled.map(w => w[field]) })
}
