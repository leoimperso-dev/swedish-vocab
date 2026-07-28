import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import type { WordType } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wordId = req.nextUrl.searchParams.get('wordId')
  const wordType = req.nextUrl.searchParams.get('wordType') as WordType | null

  if (!wordId) return NextResponse.json({ error: 'Missing wordId' }, { status: 400 })

  // Prefer words the user has already seen (more meaningful distractors)
  const seenWordIds = await db.userWord.findMany({
    where: { userId: session.user.id },
    select: { wordId: true },
    take: 200,
  })

  const distractors = await db.word.findMany({
    where: {
      id: { not: wordId, in: seenWordIds.map(uw => uw.wordId) },
      ...(wordType ? { wordType } : {}),
    },
    select: { french: true },
    take: 50,
    orderBy: { createdAt: 'asc' },
  })

  // Shuffle and pick 3
  const shuffled = distractors.sort(() => Math.random() - 0.5).slice(0, 3)

  // Fallback if not enough seen words
  if (shuffled.length < 3) {
    const fallback = await db.word.findMany({
      where: { id: { not: wordId }, ...(wordType ? { wordType } : {}) },
      select: { french: true },
      take: 20,
      skip: Math.floor(Math.random() * 50),
    })
    const extra = fallback
      .map(w => w.french)
      .filter(f => !shuffled.some(s => s.french === f))
      .slice(0, 3 - shuffled.length)
    return NextResponse.json({ distractors: [...shuffled.map(w => w.french), ...extra] })
  }

  return NextResponse.json({ distractors: shuffled.map(w => w.french) })
}
