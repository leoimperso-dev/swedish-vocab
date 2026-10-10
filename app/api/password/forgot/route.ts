import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeEmail } from '@/lib/auth/password'
import { createResetToken, RESET_TOKEN_MINUTES } from '@/lib/auth/reset-token'
import { passwordResetEmail, sendEmail } from '@/lib/email'

// Always answers ok, whether or not the address has an account: the response
// must not tell an attacker which emails are registered.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email.includes('@')) return NextResponse.json({ ok: true })

  const user = await db.user.findUnique({ where: { email }, select: { id: true, nativeLanguage: true } })
  if (user) {
    const token = await createResetToken(user.id)
    const base = process.env.AUTH_URL ?? new URL(req.url).origin
    const url = `${base}/reset-password?token=${token}`
    // With no mail provider configured, sendEmail logs the link instead — the
    // flow stays testable locally.
    await sendEmail({ to: email, ...passwordResetEmail(url, RESET_TOKEN_MINUTES, user.nativeLanguage) })
  }

  return NextResponse.json({ ok: true })
}
