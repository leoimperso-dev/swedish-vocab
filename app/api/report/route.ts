import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'

// Long enough for a sentence of explanation, short enough that the column stays
// a report and not an essay
const MAX_MESSAGE = 500

/**
 * The reports this learner sent, newest first.
 *
 * A report goes into a table nobody looks at until someone runs a script, so
 * the reporter has no idea whether it landed or was acted on. Showing their own
 * back to them closes that loop — and it is their own data, so it needs no
 * administrator role.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reports = await db.errorReport.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true, message: true, context: true, resolved: true, createdAt: true,
      shownTerm: true, shownTranslation: true,
      word: { select: { term: true, translation: true } },
    },
  })

  return NextResponse.json({ reports })
}

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
