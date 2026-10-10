import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { lookupWord } from '@/lib/dictionary'
import { getCourse } from '@/lib/current-course'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  const course = await getCourse(session.user.id)
  const properNoun = req.nextUrl.searchParams.get('name') === '1'
  const entry = await lookupWord(q, course.pair, { properNoun })
  return NextResponse.json(entry ? { found: true, ...entry } : { found: false }, {
    headers: { 'Cache-Control': 'private, max-age=86400' },
  })
}
