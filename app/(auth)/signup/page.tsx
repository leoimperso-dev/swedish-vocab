'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/primitives'
import { AuthError, AuthLinks } from '@/components/auth/AuthForm'
import { useAuthLang, useAuthStrings } from '@/components/auth/AuthLang'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password'

export default function SignupPage() {
  const router = useRouter()
  const lang = useAuthLang()
  const t = useAuthStrings()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, password, lang }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? t.signupFailed)
      setLoading(false)
      return
    }

    // No email confirmation: the account is usable straight away.
    const signedIn = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (signedIn?.error) {
      setError(t.signedUpButLoginFailed)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-9 space-y-3 text-left">
        <TextField
          label={t.firstName}
          autoComplete="given-name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <TextField
          label={t.email}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <TextField
          label={t.password}
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={t.passwordHint(MIN_PASSWORD_LENGTH)}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? t.creating : t.createAccount}
        </Button>
      </form>

      {error ? <AuthError>{error}</AuthError> : null}

      <AuthLinks>
        <p className="text-muted-foreground">
          {t.haveAccount}{' '}
          <Link href="/login" className="text-primary underline">
            {t.signIn}
          </Link>
        </p>
      </AuthLinks>
    </>
  )
}
