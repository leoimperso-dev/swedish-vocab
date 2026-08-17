import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })

export const metadata: Metadata = {
  title: 'Svenska — Apprends le suédois',
  description: 'Application de vocabulaire suédois avec répétition espacée',
  manifest: '/manifest.json',
  // iOS ignores the manifest icons for the home screen and screenshots the page
  // instead unless an apple-touch-icon is declared.
  icons: { apple: '/icon-192.png' },
  // Duel notifications only exist on iOS once the app is on the home screen,
  // so the standalone hints are load-bearing here, not decoration.
  appleWebApp: {
    capable: true,
    title: 'Svenska',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
