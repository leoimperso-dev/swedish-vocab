import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { asLang } from '@/lib/i18n'
import { LangProvider } from '@/components/LangProvider'
import BottomNav from '@/components/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.user!.id },
    select: { nativeLanguage: true },
  })
  const lang = asLang(user?.nativeLanguage)

  return (
    <LangProvider lang={lang}>
      <div className="min-h-dvh bg-slate-950 text-white pb-20">
        {children}
        <BottomNav />
      </div>
    </LangProvider>
  )
}
