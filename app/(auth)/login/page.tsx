'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/primitives'
import { GoogleIcon } from '@/components/auth/AuthBrand'
import { AuthError, AuthLinks } from '@/components/auth/AuthForm'
import { useAuthStrings } from '@/components/auth/AuthLang'

export default function LoginPage() {
  const router = useRouter()
  const t = useAuthStrings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)

    if (res?.error) {
      setError(t.wrongCredentials)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-9 space-y-3 text-left">
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
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? t.signingIn : t.signIn}
        </Button>
      </form>

      {error ? <AuthError>{error}</AuthError> : null}

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground/70">
        <span className="h-px flex-1 bg-border" />
        {t.or}
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
        variant="secondary"
        size="lg"
        className="w-full"
      >
        <GoogleIcon />
        {t.continueWithGoogle}
      </Button>

      <AuthLinks>
        <p>
          <Link href="/forgot-password" className="text-muted-foreground hover:underline">
            {t.forgotPassword}
          </Link>
        </p>
        <p className="text-muted-foreground">
          {t.noAccount}{' '}
          <Link href="/signup" className="text-primary underline">
            {t.signUp}
          </Link>
        </p>
      </AuthLinks>
    </>
  )
}
