'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getRate, getVoiceFor, isSupported, speakable, unlock, watchVoiceAvailability } from '@/lib/tts'
import { allowSleep, keepAwake } from '@/lib/wake-lock'
import { playOne, prefetch, stopAudio } from '@/lib/tts/player'

export interface SpeechItem {
  text: string
  locale: string
  // Optional pause after this item, in ms (a beat between a word and its translation)
  pauseAfter?: number
}

// Chrome silently pauses long syntheses after ~15s; a periodic resume keeps it going
const KEEPALIVE_MS = 8000
// How often the watchdog checks whether the engine is still talking
const WATCHDOG_MS = 1000
// Silence longer than this, with an utterance still unfinished, means its
// `onend` was lost — mobile engines drop it often enough that a long list
// never reaches its end without this. Long enough not to mistake the gap
// before an utterance actually starts for a stall.
const STALL_GRACE_MS = 2000

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
    allowSleep()
    stopAudio()
    if (isSupported()) window.speechSynthesis.cancel()
    setIndex(null)
  }, [])

  const speak = useCallback((items: SpeechItem[]) => {
    if (!isSupported() || items.length === 0) return
    // A new run invalidates every pending callback of the previous one
    const session = ++sessionRef.current
    clearKeepAlive()
    stopAudio()
    window.speechSynthesis.cancel()
    unlock()

    // The utterance being spoken, so the watchdog can finish it in place of a
    // lost `onend`
    let current: { advance: () => void; startedAt: number; done: boolean } | null = null
    let sinceResume = 0
    // The watchdog reads the synthesizer, which says nothing about an <audio>
    // element — it must not call a server-voiced item stalled
    let onAudio = false

    keepAliveRef.current = setInterval(() => {
      if (sessionRef.current !== session) return clearKeepAlive()
      if (onAudio) return
      const synth = window.speechSynthesis
      if (synth.speaking || synth.pending) {
        sinceResume += WATCHDOG_MS
        if (sinceResume >= KEEPALIVE_MS) {
          synth.resume()
          sinceResume = 0
        }
        return
      }
      sinceResume = 0
      // Silent. A deliberate pause between items has already advanced, so an
      // unfinished utterance here means the engine stopped without saying so.
      if (current && !current.done && Date.now() - current.startedAt > STALL_GRACE_MS) {
        current.advance()
      }
    }, WATCHDOG_MS)

    const playFrom = (i: number) => {
      if (sessionRef.current !== session) return
      if (i >= items.length) {
        current = null
        clearKeepAlive()
        setIndex(null)
        return
      }
      setIndex(i)
      keepAwake()
      const item = items[i]
      const entry = { startedAt: Date.now(), done: false, advance: () => {} }
      entry.advance = () => {
        if (entry.done || sessionRef.current !== session) return
        entry.done = true
        if (item.pauseAfter) setTimeout(() => playFrom(i + 1), item.pauseAfter)
        else playFrom(i + 1)
      }
      current = entry

      // Resolve the next item's audio while this one plays. Without it every
      // gap in the list carries a round trip, and a two-language playlist
      // sounds like it is buffering between every word.
      const next = items[i + 1]
      if (next) prefetch(speakable(next.text), next.locale)

      onAudio = true
      void playOne(speakable(item.text), item.locale, getRate()).then(played => {
        if (sessionRef.current !== session) return
        onAudio = false
        if (played) return entry.advance()
        // No server audio for this one — the device voice finishes the list
        entry.startedAt = Date.now()
        const utterance = new SpeechSynthesisUtterance(speakable(item.text))
        utterance.lang = item.locale
        const voice = getVoiceFor(item.locale)
        if (voice) utterance.voice = voice
        utterance.rate = getRate()
        utterance.onend = entry.advance
        // A missing voice for the language fires onerror — skip rather than stall
        utterance.onerror = entry.advance
        window.speechSynthesis.speak(utterance)
      })
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
