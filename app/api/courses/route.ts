import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { PAIRS, type PairId } from '@/lib/courses'

// Words the user has met, per content pair — feeds the course picker.
// Counted per distinct word so the two study directions don't double-count.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const pairs = Object.keys(PAIRS) as PairId[]
  const rows = await Promise.all(
    pairs.map(pair =>
      db.userWord.findMany({
        where: { userId, word: { pair } },
        select: { wordId: true },
        distinct: ['wordId'],
      }),
    ),
  )

  const knownByPair = Object.fromEntries(pairs.map((pair, i) => [pair, rows[i].length]))
  return NextResponse.json({ knownByPair })
}
