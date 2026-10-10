'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import { FavoriteStar } from '@/components/FavoriteStar'
import { ReportButton } from '@/components/ReportButton'
import type { Strings } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { cleanToken, midSentenceCapitals } from '@/lib/proper-nouns'

interface DictResult {
  found: boolean
  id?: string
  term?: string
  translation?: string
  forms?: string | null
  /** Other words this spelling could be — see DictEntry.also */
  also?: Array<{ term: string; translation: string }>
}

const EDGE_MARGIN = 8
// Below this viewport width the popover becomes a fixed bottom panel
const ANCHORED_MIN_WIDTH = 640
// Only one popover may be open at a time, across every TappableText on the page
const OPEN_EVENT = 'tappable-text:open'

// Module-level dictionary cache — shared across stories, examples and pages
const dictCache = new Map<string, DictResult>()

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
      // Capture, so a child that stops propagation (the star) still marks the
      // event as "inside" and does not close the popover on its way out
      onClickCapture={e => {
        ;(e.nativeEvent as MouseEvent & { tappableTextClick?: boolean }).tappableTextClick = true
      }}
      onClick={e => {
        e.stopPropagation()
        ;(e.nativeEvent as MouseEvent & { tappableTextClick?: boolean }).tappableTextClick = true
      }}
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
          <span className="flex items-start justify-between gap-2">
            <span className="block font-display text-lg font-semibold leading-tight text-foreground">
              {entry.term}
            </span>
            {/* Looking a word up while reading is exactly when it is worth
                keeping — and when a wrong entry gets noticed */}
            <span className="flex shrink-0 items-start">
              {entry.id && <FavoriteStar wordId={entry.id} label={entry.term!} size={16} className="-mt-1" />}
              <ReportButton
                wordId={entry.id}
                context="READING"
                shownTerm={entry.term}
                shownTranslation={entry.translation}
                className="-mr-1 -mt-1"
              />
            </span>
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {entry.translation}
          </span>
          {entry.forms && (
            <span className="mt-1 block text-[11px] italic leading-snug text-muted-foreground/80">
              ({entry.forms})
            </span>
          )}
          {/* One spelling, several words: "banan" is a banana and the definite
              form of "bana", a course. Only the sentence can settle it, so the
              reader gets the alternatives rather than one confident wrong answer. */}
          {entry.also?.map(other => (
            <span
              key={other.term}
              className="mt-1.5 block border-t border-border/60 pt-1.5 text-xs leading-snug text-muted-foreground/80"
            >
              <span className="font-semibold text-foreground/70">{other.term}</span> — {other.translation}
            </span>
          ))}
          <button
            onClick={e => {
              e.stopPropagation()
              ;(e.nativeEvent as MouseEvent & { tappableTextClick?: boolean }).tappableTextClick = true
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

// Renders text whose every word can be tapped to look it up in the course
// dictionary — the mechanism of the story reader, reusable on any sentence.
export default function TappableText({ text, locale, t, className, properNouns }: {
  text: string
  locale: string
  t: Strings
  className?: string
  /** Names found across the whole text, so one opening a sentence is caught too */
  properNouns?: Set<string>
}) {
  const localNames = useMemo(() => midSentenceCapitals(text), [text])
  const [active, setActive] = useState<string | null>(null) // token position key
  const [entry, setEntry] = useState<DictResult | null>(null)
  // Guards against out-of-order responses when tapping several words quickly
  const activeRef = useRef<string | null>(null)
  const instanceId = useRef(Symbol('tappable'))

  // Close when another TappableText opens, or on any outside tap
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== instanceId.current) {
        activeRef.current = null
        setActive(null)
      }
    }
    const onDocClick = (e: MouseEvent) => {
      // React delegates through this same document node — stopPropagation on the
      // synthetic event cannot cancel a sibling listener, so taps inside the
      // component flag the native event instead
      if ((e as MouseEvent & { tappableTextClick?: boolean }).tappableTextClick) return
      activeRef.current = null
      setActive(null)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    document.addEventListener('click', onDocClick)
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen)
      document.removeEventListener('click', onDocClick)
    }
  }, [])

  const handleWordTap = async (positionKey: string, rawToken: string) => {
    if (active === positionKey) {
      activeRef.current = null
      setActive(null)
      return
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: instanceId.current }))
    activeRef.current = positionKey
    setActive(positionKey)
    setEntry(null)

    const token = cleanToken(rawToken)
    if (!token) { activeRef.current = null; setActive(null); return }

    const isName = localNames.has(token) || !!properNouns?.has(token)
    const cacheKey = isName ? `${token}|name` : token
    const cached = dictCache.get(cacheKey)
    if (cached) { setEntry(cached); return }

    try {
      const res = await fetch(`/api/dictionary?q=${encodeURIComponent(token)}${isName ? '&name=1' : ''}`)
      const data: DictResult = await res.json()
      dictCache.set(cacheKey, data)
      // Only display if this word is still the active one
      if (activeRef.current === positionKey) setEntry(data)
    } catch {
      if (activeRef.current === positionKey) setActive(null)
    }
  }

  return (
    <span className={className}>
      {text.split(/(\s+)/).map((token, tIdx) => {
        if (/^\s*$/.test(token)) return token
        // Numbers, dashes, bare punctuation: nothing to look up
        if (!/\p{L}/u.test(token)) return token
        const positionKey = String(tIdx)
        const isActive = active === positionKey
        return (
          <span key={positionKey} className="relative inline-block">
            <button
              onClick={e => {
                e.stopPropagation()
                ;(e.nativeEvent as MouseEvent & { tappableTextClick?: boolean }).tappableTextClick = true
                handleWordTap(positionKey, token)
              }}
              className={cn(
                'cursor-pointer rounded-md px-0.5 transition-colors',
                isActive ? 'bg-info-soft text-primary' : 'hover:bg-surface-raised',
              )}
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
    </span>
  )
}
