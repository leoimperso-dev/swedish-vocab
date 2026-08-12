'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { CEFR_LEVELS, isCefrLevel, type CefrLevel } from '@/lib/cefr'
import { coursesFor, type Lang } from '@/lib/courses'
import { getStrings } from '@/lib/i18n'
import { setLevel } from '@/app/(app)/actions'
import { Flag } from '@/components/ui/flags'
import { cn } from '@/lib/utils'

/**
 * One level per language the user can study, all editable in one place.
 * The first-session prompt (LevelPicker) only covers the current language —
 * this is where the others get set or changed.
 */
export function LevelSettings({ native, levels }: {
  native: Lang
  levels: Record<string, string>
}) {
  const t = getStrings(native)
  const [local, setLocal] = useState(levels)
  const [saving, setSaving] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const languages = coursesFor(native).map(c => c.learned)

  const pick = (learned: Lang, level: CefrLevel) => {
    setLocal(prev => ({ ...prev, [learned]: level }))
    setSaving(learned)
    startTransition(async () => {
      await setLevel(learned, level)
      setSaving(null)
    })
  }

  return (
    <div className="space-y-4">
      {languages.map(learned => {
        const current = isCefrLevel(local[learned]) ? local[learned] : null
        return (
          <div key={learned}>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-5 w-7 shrink-0 place-items-center overflow-hidden rounded border border-border">
                <Flag lang={learned} />
              </span>
              <span className="text-sm font-semibold">{t.languageName[learned]}</span>
              {saving === learned ? (
                <Loader2 size={13} className="animate-spin text-muted-foreground" />
              ) : !current ? (
                <span className="text-[11px] text-muted-foreground">{t.levelNotSet}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {CEFR_LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => pick(learned, level)}
                  aria-pressed={current === level}
                  title={t.cefrLabel[level]}
                  className={cn(
                    'pressable rounded-lg border py-2 text-xs font-semibold',
                    current === level
                      ? 'border-primary bg-info-soft text-primary'
                      : 'border-border bg-surface text-muted-foreground',
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
            {current && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">{t.cefrDesc[current]}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
