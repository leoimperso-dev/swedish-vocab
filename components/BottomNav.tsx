'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Dumbbell, Layers, BarChart3, Swords, User } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { useStats } from '@/components/StatsProvider'
import { cn } from '@/lib/utils'

export default function BottomNav() {
  const pathname = usePathname()
  const t = getStrings(useLang())
  const { pendingDuels } = useStats()

  const navItems = [
    { href: '/dashboard', label: t.navHome, icon: Home },
    { href: '/study', label: t.navStudy, icon: Dumbbell },
    { href: '/words', label: t.navWords, icon: Layers },
    { href: '/stats', label: t.navStats, icon: BarChart3 },
    // Duels and the leaderboard share one entry — CompeteTabs switches between
    // them, so the nav does not grow a seventh column that would truncate.
    { href: '/duels', label: t.navDuels, icon: Swords, badge: pendingDuels, alsoActive: '/leaderboard' },
    { href: '/profile', label: t.navProfile, icon: User },
  ]

  return (
    <nav
      aria-label={t.navHome}
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/85 pt-1.5 backdrop-blur-xl"
    >
      <ul className="mx-auto grid max-w-[430px] grid-cols-6 px-1">
        {navItems.map(({ href, label, icon: Icon, badge, alsoActive }) => {
          const active = pathname.startsWith(href) || (!!alsoActive && pathname.startsWith(alsoActive))
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'pressable flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-7 w-11 items-center justify-center rounded-full transition-colors',
                    active && 'bg-info-soft',
                  )}
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
                  {badge ? (
                    <span
                      aria-label={`${badge}`}
                      className="absolute -right-0 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-danger-foreground"
                    >
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="w-full truncate text-center text-[10px] font-medium tracking-tight">
                  {label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
