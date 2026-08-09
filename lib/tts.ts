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

export function speak(text: string, locale: string, rate = 0.9): void {
  if (typeof window === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
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
