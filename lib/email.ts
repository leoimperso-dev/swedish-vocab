import nodemailer from 'nodemailer'

// Transactional email through Brevo's SMTP relay — the same provider Carnet de
// champs sends from. Kept on port 587 with STARTTLS: 465 is blocked on more
// networks, and Brevo advertises 587 as its default.
//
// With no BREVO_SMTP_KEY the app still works — sendEmail logs the message and
// reports failure, so a local dev can follow the reset link from the terminal.

const SMTP_HOST = 'smtp-relay.brevo.com'
const SMTP_PORT = 587

// nodemailer holds a connection pool, so the transport is built once per
// process rather than per email.
let transport: nodemailer.Transporter | null = null

function getTransport(): nodemailer.Transporter | null {
  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) return null
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS, upgraded by nodemailer after EHLO
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_KEY,
    },
  })
  return transport
}

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendEmail({ to, subject, html, text }: EmailMessage): Promise<boolean> {
  const mailer = getTransport()
  if (!mailer) {
    console.warn(`[email] BREVO_SMTP_KEY missing — not sent to ${to}\n${subject}\n${text}`)
    return false
  }

  const name = process.env.EMAIL_FROM_NAME ?? 'Svenska'
  try {
    await mailer.sendMail({
      from: `"${name}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    })
    return true
  } catch (e) {
    // A refused send must not surface to the caller: the forgot-password route
    // answers ok either way, so it cannot be used to probe for accounts.
    console.error('[email] Brevo refused the message:', e)
    return false
  }
}

export function passwordResetEmail(url: string, minutes: number): Omit<EmailMessage, 'to'> {
  const text = `Tu as demandé un nouveau mot de passe pour Svenska.

Choisis-en un ici : ${url}

Ce lien expire dans ${minutes} minutes. Si tu n'as rien demandé, ignore cet email : ton mot de passe reste inchangé.`

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">Nouveau mot de passe</h1>
  <p style="margin:0 0 20px">Tu as demandé un nouveau mot de passe pour Svenska.</p>
  <p style="margin:0 0 24px">
    <a href="${url}" style="display:inline-block;background:#005293;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Choisir mon mot de passe</a>
  </p>
  <p style="margin:0 0 8px;color:#666;font-size:13px">Ce lien expire dans ${minutes} minutes.</p>
  <p style="margin:0;color:#666;font-size:13px">Si tu n'as rien demandé, ignore cet email : ton mot de passe reste inchangé.</p>
</div>`

  return { subject: 'Réinitialiser ton mot de passe Svenska', html, text }
}
