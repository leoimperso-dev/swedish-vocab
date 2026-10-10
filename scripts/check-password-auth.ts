import 'dotenv/config'
import { db } from '../lib/db'
import { hashPassword, verifyPassword, passwordProblem } from '../lib/auth/password'
import { createResetToken, consumeResetToken } from '../lib/auth/reset-token'

// QA: the email/password flow against the real DB, with a throwaway account.
// Covers hashing, the reset token's single use, and its expiry.

const EMAIL = `check-password-${Date.now()}@example.invalid`
let failures = 0

function check(label: string, ok: boolean) {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failures++
}

async function main() {
  check('a short password is rejected', passwordProblem('abc', 'fr') !== null)
  check('an 8-char password is accepted', passwordProblem('hemlighet', 'fr') === null)

  const hash = await hashPassword('hemlighet')
  check('the hash is not the password', hash !== 'hemlighet')
  check('the right password verifies', await verifyPassword('hemlighet', hash))
  check('a wrong password does not', !(await verifyPassword('hemlighe', hash)))

  const user = await db.user.create({ data: { email: EMAIL, passwordHash: hash } })
  try {
    const token = await createResetToken(user.id)
    check('a fresh token resolves to its user', (await consumeResetToken(token))?.userId === user.id)
    check('the same token cannot be replayed', (await consumeResetToken(token)) === null)
    check('an unknown token is refused', (await consumeResetToken('deadbeef')) === null)

    const second = await createResetToken(user.id)
    const third = await createResetToken(user.id)
    check('asking again invalidates the previous link', (await consumeResetToken(second)) === null)
    check('the latest link still works', (await consumeResetToken(third))?.userId === user.id)

    const expired = await createResetToken(user.id)
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    check('an expired token is refused', (await consumeResetToken(expired)) === null)
  } finally {
    await db.user.delete({ where: { id: user.id } })
  }

  console.log(failures === 0 ? '\nAll good.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('❌', e)
  process.exit(1)
})
