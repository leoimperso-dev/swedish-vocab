import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wordId = req.nextUrl.searchParams.get('wordId')
  if (!wordId) return NextResponse.json({ error: 'Missing wordId' }, { status: 400 })

  const word = await db.word.findUnique({ where: { id: wordId }, select: { examples: true } })
  return NextResponse.json(
    { examples: Array.isArray(word?.examples) ? word.examples : [] },
    { headers: { 'Cache-Control': 'private, max-age=86400' } }
  )
}
