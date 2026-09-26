// Playback of server-synthesized audio, with the device voice as the fallback.
//
// The whole point is iOS: Safari exposes only a fixed subset of the system's
// voices to web pages — never the Siri ones, rarely a downloaded premium one —
// so the phone is stuck with a voice the learner cannot change. Audio rendered
// once on the server and played as an MP3 sounds identical on every device,
// works offline once cached, and takes the voice choice away from the OS.

import { audioKey, defaultServerVoice, langOf, voicesForLang } from '@/lib/tts/catalog'

const ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? ''
const BUCKET = 'tts'

export function serverAudioPossible(): boolean {
  return !!ORIGIN
}

// --- Preferences -----------------------------------------------------------

const ENABLED_KEY = 'tts-server-enabled'
const VOICE_KEY = 'tts-server-voices'

/** On by default wherever it is configured: it is the better voice everywhere. */
export function serverAudioEnabled(): boolean {
  if (typeof window === 'undefined' || !serverAudioPossible()) return false
  return window.localStorage.getItem(ENABLED_KEY) !== 'off'
}

export function setServerAudioEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off')
  } catch {}
}

function readVoices(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(VOICE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getServerVoice(locale: string): string | null {
  const chosen = readVoices()[langOf(locale)]
  if (chosen && voicesForLang(locale).some(v => v.id === chosen)) return chosen
  return defaultServerVoice(locale)
}

export function setServerVoice(locale: string, voiceId: string | null): void {
  const prefs = readVoices()
  if (voiceId) prefs[langOf(locale)] = voiceId
  else delete prefs[langOf(locale)]
  try {
    window.localStorage.setItem(VOICE_KEY, JSON.stringify(prefs))
  } catch {}
}

// --- The element -----------------------------------------------------------

// One element for the whole app. iOS only lets audio play from an element that
// has already been started inside a user gesture, so a fresh element per
// utterance would be silently blocked on every phone.
let element: HTMLAudioElement | null = null
let unlocked = false

const SILENCE =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTArSXyywcHYKhe9GVzZnCS3/6MzUvDMkpWHMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbMkbA=='

/** Call from inside a tap, once, before anything is played. */
export function unlockAudio(): void {
  if (unlocked || typeof window === 'undefined') return
  element ??= new Audio()
  element.src = SILENCE
  element.play().then(
    () => {
      unlocked = true
    },
    () => {},
  )
}

function audio(): HTMLAudioElement {
  element ??= new Audio()
  return element
}

// --- URLs ------------------------------------------------------------------

function cdnUrl(key: string, voiceId: string): string {
  return `${ORIGIN}/storage/v1/object/public/${BUCKET}/${voiceId}/${key.slice(0, 2)}/${key}.mp3`
}

function synthesizeUrl(text: string, voiceId: string): string {
  return `/api/tts?voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(text)}`
}

// A miss costs a round trip and a synthesis; remembering the outcome keeps a
// repeated word from paying it twice in one session.
const resolved = new Map<string, string | null>()

/**
 * The URL of an utterance already stored, without ever synthesizing. Null on a
 * miss — the caller decides whether that is worth waiting for.
 */
export async function cachedAudioUrl(text: string, locale: string): Promise<string | null> {
  if (!serverAudioEnabled()) return null
  const voiceId = getServerVoice(locale)
  if (!voiceId) return null
  const key = await audioKey(text, voiceId)
  const cacheKey = `${voiceId}:${key}`
  if (resolved.has(cacheKey)) return resolved.get(cacheKey)!
  const url = cdnUrl(key, voiceId)
  try {
    const probe = await fetch(url)
    if (!probe.ok) return null
    resolved.set(cacheKey, url)
    return url
  } catch {
    return null
  }
}

// One synthesis in flight per utterance, and no repeat for one already asked
// for: a list replayed twice must not queue the same work twice.
const requested = new Set<string>()

/**
 * Asks the server to render this utterance, without waiting for it.
 *
 * What a long playlist needs: a missing word is spoken by the device this
 * once, and by the good voice every time after. Waiting instead would freeze
 * the list for seconds on a word the learner never asked to wait for.
 */
export function requestSynthesis(text: string, locale: string): void {
  if (!serverAudioEnabled()) return
  const voiceId = getServerVoice(locale)
  if (!voiceId) return
  const id = `${voiceId}:${text}`
  if (requested.has(id)) return
  requested.add(id)
  void fetch(synthesizeUrl(text, voiceId)).catch(() => {})
}

/**
 * The URL to play, synthesizing on the fly if this utterance is new.
 * Null means the device voice has to take over.
 */
export async function audioUrlFor(text: string, locale: string): Promise<string | null> {
  if (!serverAudioEnabled()) return null
  const voiceId = getServerVoice(locale)
  if (!voiceId) return null

  const key = await audioKey(text, voiceId)
  const cacheKey = `${voiceId}:${key}`
  if (resolved.has(cacheKey)) return resolved.get(cacheKey)!

  const url = cdnUrl(key, voiceId)
  try {
    // A GET rather than a HEAD, deliberately: this is a cross-origin request
    // the service worker can cache, and it is about to be played anyway. A
    // HEAD would leave nothing behind and the word would be silent offline.
    const probe = await fetch(url)
    if (probe.ok) {
      resolved.set(cacheKey, url)
      return url
    }
  } catch {
    // Offline, or the CDN is unreachable — no point asking the server either
    return null
  }

  try {
    // Follows the redirect and lands on the CDN copy the route just wrote
    const made = await fetch(synthesizeUrl(text, voiceId))
    if (!made.ok) {
      resolved.set(cacheKey, null)
      return null
    }
    resolved.set(cacheKey, url)
    return url
  } catch {
    return null
  }
}

/** Fills the cache without playing, so the next card starts instantly. */
export function prefetch(text: string, locale: string): void {
  void cachedAudioUrl(text, locale).then(url => {
    if (!url) requestSynthesis(text, locale)
  }).catch(() => {})
}

export function stopAudio(): void {
  if (!element) return
  element.pause()
  element.removeAttribute('src')
}

/**
 * Plays one utterance, resolving true once it has been heard and false when
 * there is no server audio for it. The caller keeps ownership of the ordering,
 * which is what a playlist with a highlighted line needs.
 */
export async function playOne(
  text: string,
  locale: string,
  rate = 1,
  { wait = true }: { wait?: boolean } = {},
): Promise<boolean> {
  const url = wait ? await audioUrlFor(text, locale) : await cachedAudioUrl(text, locale)
  if (!url) {
    // Render it for next time, but let the device speak it now
    if (!wait) requestSynthesis(text, locale)
    return false
  }
  const el = audio()
  await new Promise<void>(resolve => {
    const done = () => {
      el.removeEventListener('ended', done)
      el.removeEventListener('error', done)
      resolve()
    }
    el.addEventListener('ended', done)
    el.addEventListener('error', done)
    el.src = url
    el.playbackRate = rate
    el.preservesPitch = true
    void el.play().catch(done)
  })
  return true
}

/**
 * Plays a list of utterances in order. Resolves true once the last one ends,
 * false as soon as anything is missing — the caller then speaks the whole list
 * with the device voice rather than half of it in each voice.
 */
export async function playSequence(
  items: { text: string; locale: string; pauseAfter?: number }[],
  { rate = 1, signal }: { rate?: number; signal?: { cancelled: boolean } } = {},
): Promise<boolean> {
  if (!serverAudioEnabled() || items.length === 0) return false

  const urls = await Promise.all(items.map(i => audioUrlFor(i.text, i.locale)))
  if (urls.some(u => u === null) || signal?.cancelled) return false

  const el = audio()
  for (const [i, url] of urls.entries()) {
    if (signal?.cancelled) return true
    await new Promise<void>(resolve => {
      const done = () => {
        el.removeEventListener('ended', done)
        el.removeEventListener('error', done)
        resolve()
      }
      el.addEventListener('ended', done)
      el.addEventListener('error', done)
      el.src = url!
      // The learner's rate applies to one neutral recording, so a single file
      // serves every speed
      el.playbackRate = rate
      el.preservesPitch = true
      void el.play().catch(done)
    })
    const pause = items[i].pauseAfter
    if (pause && !signal?.cancelled) await new Promise(r => setTimeout(r, pause))
  }
  return true
}
