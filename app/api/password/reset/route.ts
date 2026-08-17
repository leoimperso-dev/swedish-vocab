import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/auth/password'
import { consumeResetToken } from '@/lib/auth/reset-token'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  const problem = passwordProblem(password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const consumed = token ? await consumeResetToken(token) : null
  if (!consumed) {
    return NextResponse.json(
      { error: 'Ce lien est invalide ou a expiré. Demandes-en un nouveau.' },
      { status: 400 },
    )
  }

  const user = await db.user.update({
    where: { id: consumed.userId },
    data: { passwordHash: await hashPassword(password) },
    select: { email: true },
  })

  return NextResponse.json({ ok: true, email: user.email })
}
