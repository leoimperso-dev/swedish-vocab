import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, normalizeEmail, passwordProblem } from '@/lib/auth/password'

// Creates an email/password account, or attaches a password to an account that
// so far only had Google. The caller signs in right after: there is no email
// confirmation step.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
  }
  const problem = passwordProblem(password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const existing = await db.user.findUnique({ where: { email } })
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: 'Un compte existe déjà avec cet email. Connecte-toi.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password)
  if (existing) {
    // Same email, Google-only so far: give it a password rather than a second account.
    await db.user.update({ where: { id: existing.id }, data: { passwordHash } })
  } else {
    await db.user.create({ data: { email, name: name || null, passwordHash } })
  }

  return NextResponse.json({ ok: true })
}
