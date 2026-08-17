import 'dotenv/config'
import { passwordResetEmail, sendEmail } from '../lib/email'

// Sends one real password-reset email, to check the Brevo relay end to end.
// Usage: pnpm tsx scripts/try-email.ts <address>

async function main() {
  const to = process.argv[2] ?? process.env.EMAIL_FROM
  if (!to) {
    console.error('Usage: tsx scripts/try-email.ts <address>')
    process.exit(1)
  }

  const sent = await sendEmail({
    to,
    ...passwordResetEmail('https://example.com/reset-password?token=test', 60),
  })
  console.log(sent ? `✅ Sent to ${to}` : `❌ Not sent to ${to}`)
  process.exit(sent ? 0 : 1)
}

main()
