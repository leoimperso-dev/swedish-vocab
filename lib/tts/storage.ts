// Where the synthesized MP3s live: a public Supabase Storage bucket, served
// from its CDN.
//
// Talked to over plain REST rather than through @supabase/supabase-js — two
// calls (upload, public URL) do not justify the dependency, and the project
// already holds the credentials for the database.

import { audioPath } from '@/lib/tts/catalog'

export const AUDIO_BUCKET = 'tts'

/** Public origin of the storage CDN, or null when audio is not configured. */
export function storageOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return url ? url.replace(/\/$/, '') : null
}

/** The URL a browser fetches for an already-synthesized utterance. */
export function publicAudioUrl(key: string, voiceId: string): string | null {
  const origin = storageOrigin()
  if (!origin) return null
  return `${origin}/storage/v1/object/public/${AUDIO_BUCKET}/${audioPath(key, voiceId)}`
}

function serviceKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
}

export function storageConfigured(): boolean {
  return !!storageOrigin() && !!serviceKey()
}

/**
 * Writes one MP3, returning its public URL.
 *
 * `upsert` stays off: the path is a hash of the content, so a file that exists
 * already holds exactly these bytes. Re-uploading it would only burn bandwidth.
 */
export async function putAudio(key: string, voiceId: string, mp3: ArrayBuffer): Promise<string> {
  const origin = storageOrigin()
  const secret = serviceKey()
  if (!origin || !secret) throw new Error('storage not configured')

  const path = audioPath(key, voiceId)
  const res = await fetch(`${origin}/storage/v1/object/${AUDIO_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'audio/mpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: mp3,
  })
  // 409 = already there, which is a success for a content-addressed write
  if (!res.ok && res.status !== 409) {
    throw new Error(`storage ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return publicAudioUrl(key, voiceId)!
}

/** Whether an utterance has already been synthesized. */
export async function hasAudio(key: string, voiceId: string): Promise<boolean> {
  const url = publicAudioUrl(key, voiceId)
  if (!url) return false
  const res = await fetch(url, { method: 'HEAD' })
  return res.ok
}
