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

// Which voice the learner picked, per language: { "sv": "<voiceURI>" }. Voices
// are a property of the device, not of the account, so this stays local.
const VOICE_PREFS_KEY = 'tts-voice-prefs'

function readPrefs(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(VOICE_PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getPreferredVoiceUri(locale: string): string | null {
  return readPrefs()[locale.split('-')[0]] ?? null
}

/** Pass null to go back to the device default. */
export function setPreferredVoiceUri(locale: string, voiceUri: string | null): void {
  const prefs = readPrefs()
  const lang = locale.split('-')[0]
  if (voiceUri) prefs[lang] = voiceUri
  else delete prefs[lang]
  try {
    window.localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs))
  } catch {}
}

// Speaking rate, shared by every utterance of the app
const RATE_KEY = 'tts-rate'
export const DEFAULT_RATE = 0.9
export const RATE_BOUNDS = { min: 0.6, max: 1.3, step: 0.05 } as const

export function getRate(): number {
  if (typeof window === 'undefined') return DEFAULT_RATE
  const stored = Number(window.localStorage.getItem(RATE_KEY))
  if (!Number.isFinite(stored) || stored < RATE_BOUNDS.min || stored > RATE_BOUNDS.max) {
    return DEFAULT_RATE
  }
  return stored
}

export function setRate(rate: number): void {
  try {
    window.localStorage.setItem(RATE_KEY, String(rate))
  } catch {}
}

/** Every installed voice, whatever its language — the escape hatch of the picker. */
export function allVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return []
  return [...window.speechSynthesis.getVoices()].sort(
    (a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
  )
}

// Voices verified as the best available on the platforms that ship them —
// Microsoft's "Online (Natural)" family (Edge), Apple's and Google's premium
// ones. Only a tie-break between voices that already scored equal, so a device
// without them is never worse off.
const PREFERRED_NAMES: Record<string, readonly string[]> = {
  sv: ['mattias', 'sofie', 'alva'],
  fr: ['remy', 'denise', 'henri', 'thomas', 'audrey'],
  en: ['sonia', 'ryan', 'jenny', 'guy', 'serena', 'daniel'],
  nl: ['fenna', 'maarten', 'colette', 'xander'],
  es: ['alvaro', 'elvira', 'monica', 'jorge'],
}

/**
 * How good a voice is likely to sound, since the browser default is often the
 * most robotic one installed.
 *
 * Being a modern voice outweighs matching the exact region: a natural en-US
 * voice reads far better than a legacy en-GB one, and the accent difference
 * costs the learner less than the robot does. Region breaks the tie between
 * voices of equal quality.
 */
export function voiceScore(voice: SpeechSynthesisVoice, locale: string): number {
  let score = 0
  if (isNaturalVoice(voice)) score += 20
  if (voice.lang.replace('_', '-').toLowerCase() === locale.toLowerCase()) score += 8
  if (/google/i.test(voice.name)) score += 4
  const preferred = PREFERRED_NAMES[locale.split('-')[0]] ?? []
  const rank = preferred.findIndex(name => voice.name.toLowerCase().includes(name))
  if (rank >= 0) score += preferred.length - rank
  if (voice.default) score += 1
  return score
}

// A modern voice is marked as such by its vendor, in its name ("Microsoft Sonia
// Online (Natural)") or in its URI (Apple's "…Daniel-premium"). The legacy ones
// — Microsoft David, Apple's compact bundles, eSpeak — carry no marker at all.
const QUALITY_MARKER = /natural|neural|enhanced|premium|wavenet|siri/i

export function isNaturalVoice(voice: SpeechSynthesisVoice): boolean {
  if (QUALITY_MARKER.test(voice.name) || QUALITY_MARKER.test(voice.voiceURI)) return true
  // Chrome's own network voices bear no marker but are not the robotic ones
  return /^google/i.test(voice.name)
}

// Languages whose picker only offers the natural voices. English is the one
// that needs it: every desktop ships a pile of legacy SAPI voices for it, and
// they bury the two or three that are worth listening to.
export const NATURAL_ONLY_LANGS: readonly string[] = ['en']

export function filtersNaturalOnly(locale: string): boolean {
  return NATURAL_ONLY_LANGS.includes(locale.split('-')[0])
}

/** Every voice offered for this language, best first. */
export function voicesFor(locale: string): SpeechSynthesisVoice[] {
  if (!isSupported()) return []
  const prefix = locale.split('-')[0]
  const matching = window.speechSynthesis
    .getVoices()
    .filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(prefix))
    .sort((a, b) => voiceScore(b, locale) - voiceScore(a, locale) || a.name.localeCompare(b.name))
  if (!filtersNaturalOnly(locale)) return matching
  const natural = matching.filter(isNaturalVoice)
  // A device with no natural voice keeps its full list — an empty picker would
  // leave nothing to choose from and nothing to fall back on
  return natural.length > 0 ? natural : matching
}

export function speak(text: string, locale: string, rate = getRate()): void {
  if (typeof window === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(speakable(text))
  utterance.lang = locale
  const voice = getVoiceFor(locale)
  if (voice) utterance.voice = voice
  utterance.rate = rate
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
}

// Reads a few short items back to back, in one language. For a headword and its
// inflected forms — long playlists belong to `useSpeechQueue`, which guards
// Chrome's watchdog; a handful of words never runs long enough to trip it.
export function speakSequence(items: { text: string; locale: string }[], rate = getRate()): void {
  if (typeof window === 'undefined' || items.length === 0) return
  window.speechSynthesis.cancel()
  for (const item of items) {
    const utterance = new SpeechSynthesisUtterance(speakable(item.text))
    utterance.lang = item.locale
    const voice = getVoiceFor(item.locale)
    if (voice) utterance.voice = voice
    utterance.rate = rate
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** The voice to speak this language with: the chosen one, else the best-ranked. */
export function getVoiceFor(locale: string): SpeechSynthesisVoice | null {
  const preferred = getPreferredVoiceUri(locale)
  if (preferred) {
    // Searched across every voice, not just this language's: the picker lets a
    // multilingual voice be chosen even when it is tagged with another locale
    const chosen = allVoices().find(v => v.voiceURI === preferred)
    if (chosen) return chosen
  }
  return voicesFor(locale)[0] ?? null
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
