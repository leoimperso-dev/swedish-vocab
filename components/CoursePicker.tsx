'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { COURSES, type Course } from '@/lib/courses'
import { getStrings } from '@/lib/i18n'
import { setCourse } from '@/app/(app)/actions'
import { Flag } from '@/components/ui/flags'
import { cn } from '@/lib/utils'

function sameCourse(a: Course, b: Course): boolean {
  return a.native === b.native && a.learned === b.learned
}

export function CoursePicker({ course }: { course: Course }) {
  const t = getStrings(course.native)
  const [open, setOpen] = useState(false)
  const [knownByPair, setKnownByPair] = useState<Record<string, number> | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || knownByPair) return
    fetch('/api/courses')
      .then(r => r.json())
      .then(data => setKnownByPair(data?.knownByPair ?? {}))
      .catch(() => setKnownByPair({}))
  }, [open, knownByPair])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const pick = (target: Course) => {
    if (sameCourse(target, course)) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      await setCourse(target.native, target.learned)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t.chooseCourse}
        aria-label={t.chooseCourse}
        aria-haspopup="dialog"
        className="pressable flex h-9 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface"
      >
        <Flag lang={course.learned} />
      </button>

      {open ? <Sheet course={course} knownByPair={knownByPair} pending={pending} onPick={pick} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function Sheet({ course, knownByPair, pending, onPick, onClose }: {
  course: Course
  knownByPair: Record<string, number> | null
  pending: boolean
  onPick: (course: Course) => void
  onClose: () => void
}) {
  // Only ever rendered after a tap, so we are on the client and document exists
  const t = getStrings(course.native)

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t.chooseCourse}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
          className="safe-bottom absolute inset-x-0 bottom-0 mx-auto max-w-[430px] rounded-t-3xl border-t border-border-strong bg-surface px-4 pb-5 pt-3"
        >
          <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-10 rounded-full bg-border-strong" />
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">{t.chooseCourse}</h2>

          <div className="space-y-2">
            {COURSES.map(option => {
              const active = sameCourse(option, course)
              // Each row speaks its own interface language, so switching to a
              // course that changes the interface is visible before tapping
              const optionStrings = getStrings(option.native)
              const known = knownByPair?.[option.pair]
              const sameInterface = option.native === course.native
              const subtitle = !sameInterface
                ? optionStrings.interfaceLabel
                : known === undefined
                ? null
                : known > 0
                ? t.knownWords(known)
                : t.startCourse

              return (
                <button
                  key={`${option.native}-${option.learned}`}
                  type="button"
                  disabled={pending}
                  onClick={() => onPick(option)}
                  className={cn(
                    'pressable card-surface flex w-full items-center gap-3.5 p-4 text-left',
                    active && 'border-primary/40 bg-info-soft',
                    pending && 'opacity-60',
                  )}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-raised">
                    <Flag lang={option.learned} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-semibold">
                      {optionStrings.languageName[option.learned]}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {subtitle ?? '…'}
                    </span>
                  </span>
                  {active ? <Check size={18} className="shrink-0 text-primary" /> : null}
                  {pending && !active ? (
                    <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
