import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { knowledgeLevel } from '@/lib/sm2'
import { getCourse } from '@/lib/current-course'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const course = await getCourse(userId)
  const [words, progress, favorites] = await Promise.all([
    db.word.findMany({
      where: { pair: course.pair },
      select: {
        id: true, term: true, translation: true, category: true, source: true,
        forms: true, details: true, frequencyRank: true, examples: true, cefr: true,
      },
      orderBy: { term: 'asc' },
    }),
    db.userWord.findMany({
      where: { userId },
      select: { wordId: true, interval: true, repetitions: true },
    }),
    db.favorite.findMany({ where: { userId }, select: { wordId: true } }),
  ])

  // Best level across directions; "known" = at least one successful repetition
  // (a failed answer resets repetitions, so the word drops back to "to learn")
  const levelByWord = new Map<string, number>()
  const knownIds = new Set<string>()
  for (const p of progress) {
    const level = knowledgeLevel(p.interval)
    if (level > (levelByWord.get(p.wordId) ?? 0)) levelByWord.set(p.wordId, level)
    if (p.repetitions > 0) knownIds.add(p.wordId)
  }
  const favoriteIds = new Set(favorites.map(f => f.wordId))

  return NextResponse.json({
    words: words.map(({ examples, ...w }) => ({
      ...w,
      hasExamples: Array.isArray(examples) && examples.length > 0,
      level: levelByWord.get(w.id) ?? 0,
      known: knownIds.has(w.id),
      favorite: favoriteIds.has(w.id),
    })),
  })
}
