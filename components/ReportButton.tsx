'use client'

import { useEffect, useState } from 'react'
import { Flag, Check } from 'lucide-react'
import { useLang } from '@/components/CourseProvider'
import { getStrings } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Reports the card being shown as wrong. Placed wherever a learner meets an
 * entry — they read far more cards than any audit script, and a wrong gloss
 * that is well formed is invisible to every heuristic.
 */
export function ReportButton({ wordId, context, shownTerm, shownTranslation, size = 16, className }: {
  wordId?: string
  // What the learner was doing: the exercise type, or "READING"
  context?: string
  shownTerm?: string
  shownTranslation?: string
  size?: number
  className?: string
}) {
  const t = getStrings(useLang())
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  // The panel is positioned against the *visible* viewport, not the layout one.
  // With `fixed inset-0` the sheet stays anchored to the bottom of the page,
  // which the on-screen keyboard then covers — and iOS scrolls the whole page
  // to reveal the focused field, carrying the panel off the top of the screen.
  // Reports arrived typed blind, which is exactly how they read.
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const follow = () => setViewport({ top: vv.offsetTop, height: vv.height })
    follow()
    vv.addEventListener('resize', follow)
    vv.addEventListener('scroll', follow)
    return () => {
      vv.removeEventListener('resize', follow)
      vv.removeEventListener('scroll', follow)
    }
  }, [open])

  const send = async () => {
    if (!message.trim() || state === 'sending') return
    setState('sending')
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordId, context, shownTerm, shownTranslation, message }),
      })
      setState('sent')
      // Long enough to read the confirmation, short enough not to block the session
      setTimeout(() => {
        setOpen(false)
        setState('idle')
        setMessage('')
      }, 1400)
    } catch {
      setState('idle')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={t.reportError}
        title={t.reportError}
        className={cn('pressable shrink-0 rounded-lg p-1 text-muted-foreground', className)}
      >
        <Flag size={size} />
      </button>

      {open && (
        <div
          style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
          className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center"
          onClick={e => {
            e.stopPropagation()
            if (state !== 'sending') setOpen(false)
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="animate-rise w-full max-w-[430px] rounded-2xl border border-border-strong bg-popover p-4 text-left"
          >
            {state === 'sent' ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm font-semibold text-success">
                <Check size={18} /> {t.reportThanks}
              </p>
            ) : (
              <>
                <p className="font-display text-base font-semibold">{t.reportError}</p>
                {shownTerm && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shownTerm}
                    {shownTranslation ? ` — ${shownTranslation}` : ''}
                  </p>
                )}
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  autoFocus
                  placeholder={t.reportPlaceholder}
                  className="mt-3 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={!message.trim() || state === 'sending'}
                    onClick={send}
                  >
                    {t.reportSend}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={state === 'sending'}
                    onClick={() => setOpen(false)}
                  >
                    {t.cancel}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
