'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Volume2 } from 'lucide-react'
import { speak, unlock } from '@/lib/tts'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import { AppShell } from '@/components/AppShell'
import { Card } from '@/components/ui/primitives'
import type { Story } from '@prisma/client'

interface DictResult {
  found: boolean
  swedish?: string
  french?: string
  forms?: string | null
}

export default function StoryReader({ story }: { story: Story }) {
  const t = getStrings(useLang())
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

    const token = rawToken.toLowerCase().replace(/[.,!?;:"«»()[\]…'’„“”–—]/g, '').trim()
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
    <AppShell title={story.title} subtitle={story.titleFrench}>
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
                        <span
                          onClick={e => e.stopPropagation()}
                          className="animate-rise absolute bottom-full left-1/2 z-50 mb-2 w-[min(16rem,78vw)] -translate-x-1/2 rounded-2xl border border-border-strong bg-popover p-3.5 text-left shadow-[0_18px_45px_-12px_oklch(0_0_0/70%)]"
                        >
                          {!entry ? (
                            <span className="block text-sm text-muted-foreground">…</span>
                          ) : entry.found ? (
                            <span className="block">
                              <span className="block font-display text-lg font-semibold leading-tight text-foreground">
                                {entry.swedish}
                              </span>
                              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                                {entry.french}
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
                                  speak(entry.swedish!, 'sv-SE')
                                }}
                                className="pressable mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-primary"
                              >
                                <Volume2 size={13} /> {t.listen}
                              </button>
                            </span>
                          ) : (
                            <span className="block text-xs text-muted-foreground">{t.wordNotFound}</span>
                          )}
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-border-strong bg-popover"
                          />
                        </span>
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
