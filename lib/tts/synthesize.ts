// Turning text into an MP3, through whichever provider is configured.
//
// Two adapters behind one call. Azure is the default: it has the best Swedish
// neural voices of the three majors, and its free tier covers half a million
// characters a month — enough to voice the whole dictionary of a pair without
// paying anything. Google is there because the catalog and the price are
// close enough that being locked to one vendor would be a needless risk.

import { normalizeForAudio } from '@/lib/tts/catalog'

export type Provider = 'azure' | 'google'

export function provider(): Provider | null {
  if (process.env.AZURE_SPEECH_KEY) return 'azure'
  if (process.env.GOOGLE_TTS_API_KEY) return 'google'
  return null
}

// 32 kbps mono is transparent for a single voice and keeps the whole corpus
// inside a free storage tier; a headword is a couple of kilobytes.
const AZURE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  )
}

async function azure(text: string, voiceId: string): Promise<ArrayBuffer> {
  const key = process.env.AZURE_SPEECH_KEY!
  const region = process.env.AZURE_SPEECH_REGION ?? 'westeurope'
  const locale = voiceId.split('-').slice(0, 2).join('-')
  // Synthesized at natural speed always: the learner's rate setting is applied
  // on playback, so one file serves every speed instead of one file per speed.
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voiceId}">${escapeXml(text)}</voice></speak>`

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AZURE_FORMAT,
      'User-Agent': 'svenska-app',
    },
    body: ssml,
  })
  if (!res.ok) throw new Error(`azure ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.arrayBuffer()
}

async function google(text: string, voiceId: string): Promise<ArrayBuffer> {
  const key = process.env.GOOGLE_TTS_API_KEY!
  const locale = voiceId.split('-').slice(0, 2).join('-')
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: locale, name: voiceId },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
    }),
  })
  if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { audioContent: string }
  return Uint8Array.from(Buffer.from(data.audioContent, 'base64')).buffer as ArrayBuffer
}

/** Longest utterance accepted — a story paragraph, not a whole story. */
export const MAX_CHARS = 1200

export async function synthesize(rawText: string, voiceId: string): Promise<ArrayBuffer> {
  const text = normalizeForAudio(rawText)
  if (!text) throw new Error('empty text')
  if (text.length > MAX_CHARS) throw new Error(`text too long (${text.length})`)
  const which = provider()
  if (!which) throw new Error('no TTS provider configured')
  return which === 'azure' ? azure(text, voiceId) : google(text, voiceId)
}
