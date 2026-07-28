import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Svenska — Apprends le suédois',
  description: 'Application de vocabulaire suédois avec répétition espacée',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="fr">
      <body className={`${geist.className} bg-slate-950 text-white antialiased`}>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
