'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/primitives'
import { AuthError, AuthLinks } from '@/components/auth/AuthForm'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password'

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setError(null)
    setLoading(true)

    const res = await fetch('/api/password/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const body = await res.json().catch(() => null)

    if (!res.ok) {
      setError(body?.error ?? 'La modification a échoué.')
      setLoading(false)
      return
    }

    // The route returns the address the token belonged to, so the new password
    // can be used right away without asking for the email again.
    const signedIn = await signIn('credentials', {
      email: body.email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (signedIn?.error) {
      router.push('/login')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  if (!token) {
    return (
      <>
        <AuthError>Ce lien est invalide ou a expiré.</AuthError>
        <AuthLinks>
          <Link href="/forgot-password" className="text-primary underline">
            Demander un nouveau lien
          </Link>
        </AuthLinks>
      </>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-9 space-y-3 text-left">
        <TextField
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`${MIN_PASSWORD_LENGTH} caractères minimum.`}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <TextField
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>

      {error ? <AuthError>{error}</AuthError> : null}

      <AuthLinks>
        <Link href="/forgot-password" className="text-muted-foreground hover:underline">
          Demander un nouveau lien
        </Link>
      </AuthLinks>
    </>
  )
}
