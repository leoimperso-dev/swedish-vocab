import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { asLang } from '@/lib/i18n'
import { LangProvider } from '@/components/LangProvider'
import { StatsProvider } from '@/components/StatsProvider'
import BottomNav from '@/components/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.user!.id },
    select: { nativeLanguage: true, xp: true, streakCurrent: true, freezeCount: true },
  })
  const lang = asLang(user?.nativeLanguage)
  const stats = {
    streak: user?.streakCurrent ?? 0,
    freezes: user?.freezeCount ?? 0,
    xp: user?.xp ?? 0,
  }

  return (
    <LangProvider lang={lang}>
      <StatsProvider stats={stats}>
        <div className="min-h-dvh">
          {children}
          <BottomNav />
        </div>
      </StatsProvider>
    </LangProvider>
  )
}
