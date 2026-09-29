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

// Storage answers 429 "too_many_connections" well before the synthesizer runs
// out of quota, so a bulk warm loses uploads whose characters have already
// been paid for. Retried rather than dropped, backing off each time.
const UPLOAD_ATTEMPTS = 5

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
  let last = ''
  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * 2 ** attempt))
    let res: Response
    try {
      res = await fetch(`${origin}/storage/v1/object/${AUDIO_BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'audio/mpeg',
          'cache-control': 'public, max-age=31536000, immutable',
        },
        body: mp3,
      })
    } catch (e) {
      last = (e as Error).message
      continue
    }
    // Already there is a success for a content-addressed write: the bytes at
    // that path are a hash of exactly this audio. Storage reports the clash as
    // HTTP 400 with a 409 buried in the body, so the body has to be read.
    const body = res.ok ? '' : await res.text()
    if (res.ok || res.status === 409 || body.includes('KeyAlreadyExists')) {
      return publicAudioUrl(key, voiceId)!
    }
    last = `storage ${res.status}: ${body.slice(0, 200)}`
    // Anything but congestion is a real error — a bad key, a missing bucket
    if (res.status !== 429 && res.status < 500) break
  }
  throw new Error(last)
}

/** Whether an utterance has already been synthesized. */
export async function hasAudio(key: string, voiceId: string): Promise<boolean> {
  const url = publicAudioUrl(key, voiceId)
  if (!url) return false
  // no-store because the CDN caches its own 404s: a warm run that trusted one
  // would re-synthesize a file that already exists, paying for it twice
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
  return res.ok
}

/**
 * Every audio key already stored for a voice.
 *
 * Resuming an interrupted warm used to cost one HEAD per utterance — tens of
 * thousands of round trips before the first new word was rendered, which made
 * every restart slower than the work it was skipping. Listing each shard
 * instead turns that into a few hundred calls.
 */
export async function storedKeys(voiceId: string): Promise<Set<string>> {
  const origin = storageOrigin()
  const secret = serviceKey()
  if (!origin || !secret) throw new Error('storage not configured')

  const found = new Set<string>()
  // audioPath shards on the first two hex characters of the key
  const shards = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

  // Low, and retried: the list endpoint throttles like the upload one, and a
  // shard silently skipped here reads as "not stored yet", which sends the
  // warm loop off to synthesize thousands of files that already exist. A
  // wrong inventory is worse than a slow one.
  const CONCURRENCY = 2
  const ATTEMPTS = 7

  const page = async (shard: string, offset: number): Promise<{ name: string }[]> => {
    let last = ''
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 600 * 2 ** attempt))
      try {
        const res = await fetch(`${origin}/storage/v1/object/list/${AUDIO_BUCKET}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
          body: JSON.stringify({ prefix: `${voiceId}/${shard}/`, limit: 1000, offset }),
        })
        if (res.ok) return (await res.json()) as { name: string }[]
        last = `${res.status} ${(await res.text()).slice(0, 120)}`
      } catch (e) {
        last = (e as Error).message
      }
    }
    throw new Error(`list ${voiceId}/${shard} @${offset}: ${last}`)
  }

  const queue = [...shards]
  const worker = async () => {
    for (;;) {
      const shard = queue.shift()
      if (!shard) return
      for (let offset = 0; ; offset += 1000) {
        const items = await page(shard, offset)
        for (const item of items) found.add(item.name.replace(/\.mp3$/, ''))
        if (items.length < 1000) break
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return found
}
