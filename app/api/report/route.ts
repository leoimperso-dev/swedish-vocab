import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'

// Long enough for a sentence of explanation, short enough that the column stays
// a report and not an essay
const MAX_MESSAGE = 500

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { wordId, context, shownTerm, shownTranslation, message } = await req.json()
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message vide' }, { status: 400 })

  const course = await getCourse(session.user.id)
  await db.errorReport.create({
    data: {
      userId: session.user.id,
      wordId: typeof wordId === 'string' ? wordId : null,
      pair: course.pair,
      context: typeof context === 'string' ? context.slice(0, 40) : null,
      shownTerm: typeof shownTerm === 'string' ? shownTerm.slice(0, 200) : null,
      shownTranslation: typeof shownTranslation === 'string' ? shownTranslation.slice(0, 200) : null,
      message: text.slice(0, MAX_MESSAGE),
    },
  })

  return NextResponse.json({ ok: true })
}
