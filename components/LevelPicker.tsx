'use client'

import { useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { CEFR_LEVELS, type CefrLevel } from '@/lib/cefr'
import { getStrings } from '@/lib/i18n'
import { useCourse, useLevel } from '@/components/CourseProvider'
import { setLevel } from '@/app/(app)/actions'
import { AppShell } from '@/components/AppShell'
import { cn } from '@/lib/utils'

/**
 * Level chooser for the language being learned, shown before its first session.
 * Changing a level afterwards — for any language — happens in LevelSettings.
 */
export function LevelPicker({ onDone }: { onDone?: () => void }) {
  const course = useCourse()
  const current = useLevel()
  const t = getStrings(course.native)
  const [pending, startTransition] = useTransition()

  const pick = (level: CefrLevel) => {
    startTransition(async () => {
      await setLevel(course.learned, level)
      onDone?.()
    })
  }

  return (
    <AppShell title={t.levelTitle} subtitle={t.levelSubtitle(t.languageName[course.learned])}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{t.levelExplainer}</p>

        <div className="space-y-2.5">
          {CEFR_LEVELS.map(level => {
            const active = current === level
            return (
              <button
                key={level}
                disabled={pending}
                onClick={() => pick(level)}
                className={cn(
                  'pressable card-surface flex w-full items-center gap-3.5 p-4 text-left disabled:opacity-60',
                  active && 'border-primary/50 bg-info-soft',
                )}
              >
                <span
                  className={cn(
                    'grid size-12 shrink-0 place-items-center rounded-2xl font-display text-base font-semibold',
                    active ? 'bg-primary/20 text-primary' : 'bg-surface-raised text-muted-foreground',
                  )}
                >
                  {level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-semibold">{t.cefrLabel[level]}</span>
                  <span className="block text-xs text-muted-foreground">{t.cefrDesc[level]}</span>
                </span>
                {active && <Check size={18} className="shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>

        {pending && (
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> {t.loading}
          </p>
        )}
      </div>
    </AppShell>
  )
}
