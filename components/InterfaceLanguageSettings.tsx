'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { COURSES, coursesFor, type Course } from '@/lib/courses'
import { getStrings, INTERFACE_LANGS, type InterfaceLang } from '@/lib/i18n'
import { setCourse } from '@/app/(app)/actions'
import { Flag } from '@/components/ui/flags'
import { cn } from '@/lib/utils'

// The interface language is the course's native side: switching it opens the
// course of that language, keeping the learned language when the pair exists.
const NATIVE_LANGS = INTERFACE_LANGS.filter(lang => COURSES.some(c => c.native === lang))

export function InterfaceLanguageSettings({ course }: { course: Course }) {
  const t = getStrings(course.native)
  const router = useRouter()
  const [selected, setSelected] = useState(course.native)
  const [pending, startTransition] = useTransition()

  const pick = (lang: InterfaceLang) => {
    if (lang === selected) return
    const next = coursesFor(lang).find(c => c.learned === course.learned) ?? coursesFor(lang)[0]
    setSelected(lang)
    startTransition(async () => {
      await setCourse(next.native, next.learned)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {NATIVE_LANGS.map(lang => {
          const name = getStrings(lang).languageName[lang]
          return (
            <button
              key={lang}
              onClick={() => pick(lang)}
              aria-pressed={selected === lang}
              disabled={pending}
              className={cn(
                'pressable flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                selected === lang
                  ? 'border-primary bg-info-soft text-primary'
                  : 'border-border bg-surface text-muted-foreground',
              )}
            >
              <span className="grid h-4 w-6 shrink-0 place-items-center overflow-hidden rounded-sm border border-border">
                <Flag lang={lang} />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
              {pending && selected === lang && <Loader2 size={13} className="animate-spin" />}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{t.interfaceLanguageHint}</p>
    </div>
  )
}
