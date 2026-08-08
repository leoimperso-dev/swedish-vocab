'use client'

import type { ReactNode } from 'react'
import { Flame, Snowflake, Zap } from 'lucide-react'
import { localeOf } from '@/lib/courses'
import { useCourse } from '@/components/CourseProvider'
import { useStats } from '@/components/StatsProvider'
import { CoursePicker } from '@/components/CoursePicker'
import { Chip } from '@/components/ui/primitives'

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const course = useCourse()
  const { streak, freezes, xp } = useStats()

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] pb-28">
      <header className="safe-top sticky top-0 z-40 border-b border-border/70 bg-background/85 px-4 pb-3 backdrop-blur-xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <CoursePicker course={course} />
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <Chip tone="streak">
            <Flame size={13} /> {streak} j
          </Chip>
          {freezes > 0 ? (
            <Chip tone="freeze">
              <Snowflake size={13} /> {freezes}
            </Chip>
          ) : null}
          <Chip tone="warning">
            <Zap size={13} /> {xp.toLocaleString(localeOf(course.native))} XP
          </Chip>
        </div>
      </header>

      <main className="animate-rise px-4 pt-4">{children}</main>
    </div>
  )
}

