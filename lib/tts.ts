// Web Speech API wrapper for TTS (Swedish or French depending on app mode)
// iOS requires a user gesture before first use — call unlock() on first tap

let unlocked = false

export function unlock() {
  if (unlocked) return
  const utterance = new SpeechSynthesisUtterance('')
  window.speechSynthesis.speak(utterance)
  unlocked = true
}

export function speak(text: string, locale = 'sv-SE', rate = 0.9): void {
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

export function getSwedishVoice(): SpeechSynthesisVoice | null {
  if (!isSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  return voices.find(v => v.lang.startsWith('sv')) ?? null
}
