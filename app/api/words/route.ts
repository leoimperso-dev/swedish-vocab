import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { knowledgeLevel } from '@/lib/sm2'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const [words, progress, favorites] = await Promise.all([
    db.word.findMany({
      select: {
        id: true, swedish: true, french: true, category: true, source: true,
        forms: true, details: true, frequencyRank: true,
      },
      orderBy: { swedish: 'asc' },
    }),
    db.userWord.findMany({ where: { userId }, select: { wordId: true, interval: true } }),
    db.favorite.findMany({ where: { userId }, select: { wordId: true } }),
  ])

  const levelByWord = new Map(progress.map(p => [p.wordId, knowledgeLevel(p.interval)]))
  const favoriteIds = new Set(favorites.map(f => f.wordId))

  return NextResponse.json({
    words: words.map(w => ({
      ...w,
      level: levelByWord.get(w.id) ?? 0,
      favorite: favoriteIds.has(w.id),
    })),
  })
}
