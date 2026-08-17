'use client'

import { useRouter } from 'next/navigation'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { Segmented } from '@/components/ui/primitives'

/**
 * Duels and the leaderboard are one section with two pages, so the nav keeps
 * six entries instead of growing a seventh that would truncate on a phone.
 */
export function CompeteTabs({ active }: { active: 'duels' | 'leaderboard' }) {
  const router = useRouter()
  const t = getStrings(useLang())
  return (
    <Segmented
      value={active}
      onChange={v => router.push(v === 'duels' ? '/duels' : '/leaderboard')}
      options={[
        { value: 'duels', label: t.tabDuels },
        { value: 'leaderboard', label: t.tabLeaderboard },
      ]}
    />
  )
}
