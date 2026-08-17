'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/primitives'
import { AuthLinks, AuthNotice } from '@/components/auth/AuthForm'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/password/forgot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    // Confirmed whatever the outcome, so the page never reveals which addresses
    // have an account.
    setSent(true)
  }

  if (sent) {
    return (
      <>
        <AuthNotice>
          Si un compte existe pour {email}, un lien vient d&apos;être envoyé. Il expire dans une
          heure.
        </AuthNotice>
        <AuthLinks>
          <Link href="/login" className="text-primary underline">
            Retour à la connexion
          </Link>
        </AuthLinks>
      </>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-9 space-y-3 text-left">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          hint="Nous t'enverrons un lien pour choisir un nouveau mot de passe."
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Envoi…' : 'Envoyer le lien'}
        </Button>
      </form>

      <AuthLinks>
        <Link href="/login" className="text-muted-foreground hover:underline">
          Retour à la connexion
        </Link>
      </AuthLinks>
    </>
  )
}
