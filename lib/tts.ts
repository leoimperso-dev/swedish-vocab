// Web Speech API wrapper for TTS — the caller passes the locale of the language
// being learned (see localeOf in lib/courses.ts).
// iOS requires a user gesture before first use — call unlock() on first tap

let unlocked = false

export function unlock() {
  if (unlocked) return
  const utterance = new SpeechSynthesisUtterance('')
  window.speechSynthesis.speak(utterance)
  unlocked = true
}

/**
 * Turns dictionary notation into something a synthesizer can say out loud.
 *
 * Entries are written to be read, not spoken: "intelligent / malin" lists two
 * senses, "une école (primaire)" carries a usage note. Handed to the engine
 * as-is, the first is read "intelligent slash malin" and the second drags the
 * parenthesis into the answer. Slashes become pauses, notes are dropped.
 */
export function speakable(text: string): string {
  const spoken = text
    .replace(/\([^)]*\)/g, ' ')
    // Dictionary shorthand, spelled out letter by letter otherwise
    .replace(/\bqqch\b/gi, 'quelque chose')
    .replace(/\bqqn\b/gi, "quelqu'un")
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[\s,]+|[\s,]+$/g, '')
  // A word made only of notes still has to be pronounced somehow
  return spoken || text
}

export function speak(text: string, locale: string, rate = 0.9): void {
  if (typeof window === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(speakable(text))
  utterance.lang = locale
  utterance.rate = rate
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function getVoiceFor(locale: string): SpeechSynthesisVoice | null {
  if (!isSupported()) return null
  const prefix = locale.split('-')[0]
  return window.speechSynthesis.getVoices().find(v => v.lang.startsWith(prefix)) ?? null
}

/**
 * Whether the device can actually speak this language. The voice list loads
 * asynchronously, so the callback may fire twice: unknown first, then settled.
 * Returns an unsubscribe function.
 */
export function watchVoiceAvailability(
  locale: string,
  onChange: (available: boolean) => void,
): () => void {
  if (!isSupported()) {
    onChange(false)
    return () => {}
  }
  const check = () => {
    const voices = window.speechSynthesis.getVoices()
    // An empty list means "not loaded yet", not "no voice" — stay optimistic
    if (voices.length === 0) return
    onChange(!!getVoiceFor(locale))
  }
  check()
  window.speechSynthesis.addEventListener('voiceschanged', check)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', check)
}
