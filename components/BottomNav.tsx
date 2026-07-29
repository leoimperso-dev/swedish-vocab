'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'

export default function BottomNav() {
  const pathname = usePathname()
  const t = getStrings(useLang())

  const navItems = [
    { href: '/dashboard', label: t.navHome, icon: '🏠' },
    { href: '/study', label: t.navStudy, icon: '📖' },
    { href: '/words', label: t.navWords, icon: '📚' },
    { href: '/stats', label: t.navStats, icon: '📊' },
    { href: '/leaderboard', label: t.navLeaderboard, icon: '🏆' },
    { href: '/profile', label: t.navProfile, icon: '👤' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 safe-area-pb">
      <div className="flex">
        {navItems.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors cursor-pointer ${
                active ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
