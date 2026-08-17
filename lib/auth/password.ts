import bcrypt from 'bcryptjs'

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

// Returns the reason the password is unusable, or null when it is fine.
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`
  }
  return null
}
