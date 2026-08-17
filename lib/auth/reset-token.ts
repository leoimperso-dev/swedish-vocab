import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'

export const RESET_TOKEN_MINUTES = 60

// The link carries the raw token; the row keeps only its digest.
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  // A new request invalidates the pending ones — a stolen older link stops working.
  await db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } })
  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
    },
  })
  return token
}

// Consumes the token and returns the user it belonged to, or null if it is
// unknown, already used or expired.
export async function consumeResetToken(token: string): Promise<{ userId: string } | null> {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: digest(token) } })
  if (!row || row.usedAt || row.expiresAt < new Date()) return null

  // Marking it used is the guard against a replay, so it must happen before the
  // caller writes the new password.
  const consumed = await db.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  if (consumed.count === 0) return null

  return { userId: row.userId }
}
