import bcrypt from 'bcryptjs'
import { getStrings } from '@/lib/i18n'

export const MIN_PASSWORD_LENGTH = 8

const ROUNDS = 12

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Returns the reason the password is unusable, in the visitor's language, or null when it is fine.
export function passwordProblem(password: string, lang: string | null | undefined): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return getStrings(lang).auth.passwordTooShort(MIN_PASSWORD_LENGTH)
  }
  return null
}
