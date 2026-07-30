'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { speak, unlock } from '@/lib/tts'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
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

  const paragraphs = story.body.split(/\n\n+/)

  const handleWordTap = async (positionKey: string, rawToken: string) => {
    if (active === positionKey) {
      setActive(null)
      return
    }
    setActive(positionKey)
    setEntry(null)

    const token = rawToken.toLowerCase().replace(/[.,!?;:"«»()[\]…'’„“”–—]/g, '').trim()
    if (!token) { setActive(null); return }

    const cached = cacheRef.current.get(token)
    if (cached) { setEntry(cached); return }

    try {
      const res = await fetch(`/api/dictionary?q=${encodeURIComponent(token)}`)
      const data: DictResult = await res.json()
      cacheRef.current.set(token, data)
      setEntry(data)
    } catch {
      setActive(null)
    }
  }

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-5" onClick={() => setActive(null)}>
      <div>
        <Link href="/reading" className="text-slate-400 text-sm cursor-pointer hover:text-slate-200">
          {t.back}
        </Link>
        <h1 className="text-2xl font-bold mt-1">{story.title}</h1>
        <p className="text-slate-500 text-sm">{story.titleFrench}</p>
      </div>

      <p className="text-slate-600 text-xs">{t.tapAnyWord}</p>

      <article className="space-y-4 text-lg leading-loose">
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
                    className={`cursor-pointer rounded px-0.5 transition-colors ${
                      isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'
                    }`}
                  >
                    {token}
                  </button>
                  {isActive && (
                    <span
                      onClick={e => e.stopPropagation()}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 block w-max max-w-[75vw] bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm shadow-xl shadow-black/40"
                    >
                      {!entry ? (
                        <span className="text-slate-400">…</span>
                      ) : entry.found ? (
                        <span className="block text-left space-y-0.5">
                          <span className="flex items-center gap-2">
                            <span className="font-bold text-white">{entry.swedish}</span>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                unlock()
                                speak(entry.swedish!, 'sv-SE')
                              }}
                              className="cursor-pointer text-xs"
                            >
                              🔊
                            </button>
                          </span>
                          <span className="block text-blue-300">{entry.french}</span>
                          {entry.forms && (
                            <span className="block text-slate-400 text-xs">({entry.forms})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">{t.wordNotFound}</span>
                      )}
                    </span>
                  )}
                </span>
              )
            })}
          </p>
        ))}
      </article>
    </main>
  )
}
