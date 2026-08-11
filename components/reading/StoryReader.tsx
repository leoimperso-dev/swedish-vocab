'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Volume2 } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import { getStrings, type Strings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { localeOf } from '@/lib/courses'
import { AppShell } from '@/components/AppShell'
import { Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Story } from '@prisma/client'

interface DictResult {
  found: boolean
  term?: string
  translation?: string
  forms?: string | null
}

const EDGE_MARGIN = 8
// Below this viewport width the popover becomes a fixed bottom panel
const ANCHORED_MIN_WIDTH = 640

// On phones: a fixed panel pinned above the bottom nav — always fully on
// screen, no measurement involved. On wider screens: a bubble anchored to the
// word, measured after render and shifted back into the viewport (flipping
// below the word when the sticky header would cover it).
function WordPopover({ entry, token, locale, t }: {
  entry: DictResult | null
  token: string
  locale: string
  t: Strings
}) {
  const popRef = useRef<HTMLSpanElement>(null)
  const arrowRef = useRef<HTMLSpanElement>(null)
  const [below, setBelow] = useState(false)

  useLayoutEffect(() => {
    const el = popRef.current
    if (!el) return
    // Fixed panel on phones: CSS owns the position, no clamping to do
    if (window.innerWidth < ANCHORED_MIN_WIDTH) {
      el.style.transform = ''
      return
    }
    // Measure from the neutral position — the effect re-runs when the entry
    // loads (size changes) and when the popover flips sides
    el.style.transform = 'translateX(-50%)'
    const rect = el.getBoundingClientRect()
    let dx = 0
    if (rect.left < EDGE_MARGIN) dx = EDGE_MARGIN - rect.left
    else if (rect.right > window.innerWidth - EDGE_MARGIN) {
      dx = window.innerWidth - EDGE_MARGIN - rect.right
    }
    el.style.transform = `translateX(calc(-50% + ${dx}px))`
    if (arrowRef.current) {
      arrowRef.current.style.transform = `translateX(calc(-50% - ${dx}px)) rotate(45deg)`
    }
    // Under the sticky header (or clipped by the viewport top): flip below the word
    if (!below) {
      const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
      if (rect.top < headerBottom + 4) setBelow(true)
    }
  }, [entry, below])

  // The headword may be a proper noun: unknown and capitalised in the text
  const isName = !entry?.found && /^\p{Lu}/u.test(token)

  return (
    <span
      ref={popRef}
      onClick={e => e.stopPropagation()}
      className={cn(
        'animate-rise z-50 rounded-2xl border border-border-strong bg-popover p-3.5 text-left shadow-[0_18px_45px_-12px_oklch(0_0_0/70%)]',
        // Phone: fixed sheet above the bottom nav, full width minus margins
        'fixed inset-x-3 bottom-24 max-h-[45vh] overflow-y-auto',
        // sm+: bubble anchored to the word
        'sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:max-h-none sm:w-[min(16rem,78vw)] sm:-translate-x-1/2 sm:overflow-visible',
        below ? 'sm:top-full sm:mt-2' : 'sm:bottom-full sm:mb-2',
      )}
    >
      {!entry ? (
        <span className="block text-sm text-muted-foreground">…</span>
      ) : entry.found ? (
        <span className="block">
          <span className="block font-display text-lg font-semibold leading-tight text-foreground">
            {entry.term}
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {entry.translation}
          </span>
          {entry.forms && (
            <span className="mt-1 block text-[11px] italic leading-snug text-muted-foreground/80">
              ({entry.forms})
            </span>
          )}
          <button
            onClick={e => {
              e.stopPropagation()
              unlock()
              speak(entry.term!, locale)
            }}
            className="pressable mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-primary"
          >
            <Volume2 size={13} /> {t.listen}
          </button>
        </span>
      ) : (
        <span className="block text-xs text-muted-foreground">
          {isName ? t.properNoun : t.wordNotFound}
        </span>
      )}
      {/* The arrow only makes sense when the bubble is anchored to its word */}
      <span
        ref={arrowRef}
        aria-hidden="true"
        className={cn(
          'absolute left-1/2 hidden size-3 -translate-x-1/2 rotate-45 border-border-strong bg-popover sm:block',
          below ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-b border-r',
        )}
      />
    </span>
  )
}

export default function StoryReader({ story }: { story: Story }) {
  const course = useCourse()
  const t = getStrings(course.native)
  const locale = localeOf(course.learned)
  const [active, setActive] = useState<string | null>(null) // "para-token" position key
  const [entry, setEntry] = useState<DictResult | null>(null)
  const cacheRef = useRef(new Map<string, DictResult>())
  // Guards against out-of-order responses when tapping several words quickly
  const activeRef = useRef<string | null>(null)

  const paragraphs = story.body.split(/\n\n+/)

  const handleWordTap = async (positionKey: string, rawToken: string) => {
    if (active === positionKey) {
      activeRef.current = null
      setActive(null)
      return
    }
    activeRef.current = positionKey
    setActive(positionKey)
    setEntry(null)

    const token = rawToken.toLowerCase().replace(/[.,!?¿¡;:"«»()[\]…'’„“”–—]/g, '').trim()
    if (!token) { activeRef.current = null; setActive(null); return }

    const cached = cacheRef.current.get(token)
    if (cached) { setEntry(cached); return }

    try {
      const res = await fetch(`/api/dictionary?q=${encodeURIComponent(token)}`)
      const data: DictResult = await res.json()
      cacheRef.current.set(token, data)
      // Only display if this word is still the active one
      if (activeRef.current === positionKey) setEntry(data)
    } catch {
      if (activeRef.current === positionKey) setActive(null)
    }
  }

  return (
    <AppShell title={story.title} subtitle={story.titleTranslated}>
      {/* Closes the popover on any outside tap — mirrors the old <main onClick> behavior */}
      <div onClick={() => setActive(null)}>
        <Link
          href="/reading"
          className="pressable mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          {t.back}
        </Link>

        <Card className="p-5">
          <div className="space-y-5 text-[17px] leading-[2] tracking-tight">
            {paragraphs.map((paragraph, pIdx) => (
              <p key={pIdx}>
                {paragraph.split(/(\s+)/).map((token, tIdx) => {
                  if (/^\s*$/.test(token)) return token
                  // Numbers, dashes, bare punctuation: nothing to look up
                  if (!/\p{L}/u.test(token)) return token
                  const positionKey = `${pIdx}-${tIdx}`
                  const isActive = active === positionKey
                  return (
                    <span key={positionKey} className="relative inline-block">
                      <button
                        onClick={e => { e.stopPropagation(); handleWordTap(positionKey, token) }}
                        className={`cursor-pointer rounded-md px-0.5 transition-colors ${
                          isActive ? 'bg-info-soft text-primary' : 'hover:bg-surface-raised'
                        }`}
                      >
                        {token}
                      </button>
                      {isActive && (
                        <WordPopover
                          key={positionKey}
                          entry={entry}
                          token={token.replace(/^["'«„(¿¡]+/, '')}
                          locale={locale}
                          t={t}
                        />
                      )}
                    </span>
                  )
                })}
              </p>
            ))}
          </div>
        </Card>

        <p className="mt-3 text-center text-xs text-muted-foreground">{t.tapAnyWord}</p>
      </div>
    </AppShell>
  )
}
