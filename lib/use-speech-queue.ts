'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupported, speakable, unlock, watchVoiceAvailability } from '@/lib/tts'

export interface SpeechItem {
  text: string
  locale: string
  // Optional pause after this item, in ms (a beat between a word and its translation)
  pauseAfter?: number
}

// Chrome silently pauses long syntheses after ~15s; a periodic resume keeps it going
const KEEPALIVE_MS = 8000

/**
 * Plays a list of utterances in order, each with its own language.
 * Returns the index being spoken so callers can highlight it.
 *
 * Guards the two traps of the Web Speech API: events from a cancelled run
 * arriving late (session token), and Chrome's watchdog cutting long playback.
 */
export function useSpeechQueue() {
  const [index, setIndex] = useState<number | null>(null)
  const sessionRef = useRef(0)
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearKeepAlive = () => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
  }

  const stop = useCallback(() => {
    sessionRef.current++
    clearKeepAlive()
    if (isSupported()) window.speechSynthesis.cancel()
    setIndex(null)
  }, [])

  const speak = useCallback((items: SpeechItem[]) => {
    if (!isSupported() || items.length === 0) return
    // A new run invalidates every pending callback of the previous one
    const session = ++sessionRef.current
    clearKeepAlive()
    window.speechSynthesis.cancel()
    unlock()

    keepAliveRef.current = setInterval(() => {
      if (sessionRef.current !== session) return clearKeepAlive()
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume()
    }, KEEPALIVE_MS)

    const playFrom = (i: number) => {
      if (sessionRef.current !== session) return
      if (i >= items.length) {
        clearKeepAlive()
        setIndex(null)
        return
      }
      setIndex(i)
      const item = items[i]
      const utterance = new SpeechSynthesisUtterance(speakable(item.text))
      utterance.lang = item.locale
      utterance.rate = 0.9
      const next = () => {
        if (sessionRef.current !== session) return
        if (item.pauseAfter) setTimeout(() => playFrom(i + 1), item.pauseAfter)
        else playFrom(i + 1)
      }
      utterance.onend = next
      // A missing voice for the language fires onerror — skip rather than stall
      utterance.onerror = next
      window.speechSynthesis.speak(utterance)
    }

    playFrom(0)
  }, [])

  // Leaving the page must not keep talking
  useEffect(() => stop, [stop])

  return { speak, stop, index, playing: index !== null }
}

/** True once the device is known to lack a voice for this language. */
export function useMissingVoice(locale: string): boolean {
  const [missing, setMissing] = useState(false)
  useEffect(() => watchVoiceAvailability(locale, ok => setMissing(!ok)), [locale])
  return missing
}
