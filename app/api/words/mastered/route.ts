import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCourse } from '@/lib/current-course'
import { markMastered, MAX_MASTERED_PER_CALL } from '@/lib/words/mastered'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const wordIds: string[] = Array.isArray(body?.wordIds)
    ? ([...new Set(body.wordIds.filter((id: unknown) => typeof id === 'string'))] as string[])
    : []
  if (wordIds.length === 0 || wordIds.length > MAX_MASTERED_PER_CALL) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const course = await getCourse(userId)
  return NextResponse.json({ updated: await markMastered(userId, course, wordIds) })
}
