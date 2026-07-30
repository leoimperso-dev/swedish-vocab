import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { lookupWord } from '@/lib/dictionary'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  const entry = await lookupWord(q)
  return NextResponse.json(entry ? { found: true, ...entry } : { found: false })
}
