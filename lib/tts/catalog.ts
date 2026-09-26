// The server-side voice catalog: which synthesized voice each language gets,
// and how to address the resulting file.
//
// Runs on both sides. The browser derives the CDN path itself and fetches the
// audio directly, so a warm word costs one cached GET and no server call at
// all; only a miss goes through /api/tts.

/** A voice offered for a language. `id` is the provider's own voice name. */
export interface ServerVoice {
  id: string
  label: string
  gender: 'female' | 'male'
}

// Azure Neural voices. Chosen for being the modern ("Neural") generation in
// each language — the quality gap with the legacy voices an iPhone exposes to
// web pages is the entire reason this pipeline exists.
export const SERVER_VOICES: Record<string, readonly ServerVoice[]> = {
  sv: [
    { id: 'sv-SE-SofieNeural', label: 'Sofie', gender: 'female' },
    { id: 'sv-SE-MattiasNeural', label: 'Mattias', gender: 'male' },
    { id: 'sv-SE-HilleviNeural', label: 'Hillevi', gender: 'female' },
  ],
  fr: [
    { id: 'fr-FR-DeniseNeural', label: 'Denise', gender: 'female' },
    { id: 'fr-FR-HenriNeural', label: 'Henri', gender: 'male' },
  ],
  en: [
    { id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'female' },
    { id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'male' },
  ],
  nl: [
    { id: 'nl-NL-FennaNeural', label: 'Fenna', gender: 'female' },
    { id: 'nl-NL-MaartenNeural', label: 'Maarten', gender: 'male' },
  ],
  es: [
    { id: 'es-ES-ElviraNeural', label: 'Elvira', gender: 'female' },
    { id: 'es-ES-AlvaroNeural', label: 'Álvaro', gender: 'male' },
  ],
}

export function langOf(locale: string): string {
  return locale.split('-')[0]
}

export function voicesForLang(locale: string): readonly ServerVoice[] {
  return SERVER_VOICES[langOf(locale)] ?? []
}

/** The voice actually used when the learner has expressed no preference. */
export function defaultServerVoice(locale: string): string | null {
  return voicesForLang(locale)[0]?.id ?? null
}

export function isKnownVoice(voiceId: string): boolean {
  return Object.values(SERVER_VOICES).some(list => list.some(v => v.id === voiceId))
}

/**
 * What actually gets synthesized. Must match byte for byte between the browser
 * deriving a path and the worker that wrote the file — any drift and every
 * lookup misses, silently re-synthesizing the whole dictionary.
 */
export function normalizeForAudio(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Content address of one utterance.
 *
 * Keying on the text rather than on a word id is what makes the cache pay off:
 * the same sentence quoted by three entries is synthesized once, and editing a
 * gloss orphans its old file instead of serving stale audio under a live id.
 */
export async function audioKey(text: string, voiceId: string): Promise<string> {
  const payload = `${voiceId}\n${normalizeForAudio(text)}`
  const bytes = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  // 20 hex chars — 80 bits, far past any collision risk at a few million files
  return hex.slice(0, 20)
}

/** Path inside the storage bucket. Sharded so no directory holds every file. */
export function audioPath(key: string, voiceId: string): string {
  return `${voiceId}/${key.slice(0, 2)}/${key}.mp3`
}
