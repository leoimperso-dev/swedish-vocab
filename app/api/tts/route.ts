import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { audioKey, isKnownVoice, normalizeForAudio } from '@/lib/tts/catalog'
import { hasAudio, publicAudioUrl, putAudio, storageConfigured } from '@/lib/tts/storage'
import { MAX_CHARS, provider, synthesize } from '@/lib/tts/synthesize'

// Synthesis is slow relative to a route; storage upload adds to it
export const maxDuration = 30

/**
 * Synthesizes one utterance and redirects to its permanent URL.
 *
 * Only ever reached on a miss: the browser derives the same content address
 * and fetches the CDN directly, so anything already voiced never touches this
 * route. That is what keeps the bill proportional to new content rather than
 * to usage — and what makes warming the corpus ahead of time optional rather
 * than load-bearing.
 *
 * Behind auth, because an open endpoint is somebody else's synthesis budget.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const text = normalizeForAudio(req.nextUrl.searchParams.get('text') ?? '')
  const voice = req.nextUrl.searchParams.get('voice') ?? ''
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > MAX_CHARS) return NextResponse.json({ error: 'text too long' }, { status: 413 })
  // Only voices from the catalog: the id reaches the provider, and it also
  // names a directory in a public bucket
  if (!isKnownVoice(voice)) return NextResponse.json({ error: 'unknown voice' }, { status: 400 })
  if (!provider() || !storageConfigured()) {
    // The client falls back to the device voice on this
    return NextResponse.json({ error: 'audio not configured' }, { status: 503 })
  }

  const key = await audioKey(text, voice)
  const url = publicAudioUrl(key, voice)!

  try {
    // Another tab may have synthesized it between the client's miss and here
    if (await hasAudio(key, voice)) return NextResponse.redirect(url, 302)
    const mp3 = await synthesize(text, voice)
    await putAudio(key, voice, mp3)
  } catch (e) {
    console.error('[tts]', (e as Error).message)
    return NextResponse.json({ error: 'synthesis failed' }, { status: 502 })
  }
  // 302, not 307: the CDN copy is permanent but this route's answer is not
  return NextResponse.redirect(url, 302)
}
