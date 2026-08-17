// Talks to Groq and hands back a plain-text stream, falling back across models
// when one is rate-limited.
//
// The whole fallback finishes before a Response is built, on purpose: Groq
// raises a 429 from the initial create() call, before any chunk exists, so an
// error can still be reported as JSON. Once the 200 is returned, the headers
// are gone and a failure can only end the stream.
import OpenAI from 'openai'
import {
  ATTEMPT_TIMEOUT_MS, CHAT_CHAIN, COMPLETION_MAX_TOKENS, MAX_PASSES, PROVIDERS, TEMPERATURE,
  WAIT_CAP_MS, cooldownRemainingMs, rungKey, setCooldown, type ChainEntry,
} from '@/lib/chat/models'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Every model is rate-limited; the caller should tell the learner to wait. */
export class ChatSaturatedError extends Error {
  constructor(public retryAfterSec: number) {
    super('all models saturated')
  }
}

/** No key configured — a deployment problem, not a rate limit. */
export class ChatUnavailableError extends Error {}

type StreamChunk = { choices: Array<{ delta?: { content?: string } }> }

// One client per provider, all speaking the OpenAI protocol
const clients = new Map<string, OpenAI>()

function clientFor(name: string): OpenAI | null {
  const provider = PROVIDERS[name]
  const apiKey = provider && process.env[provider.envKey]
  // No key configured for this provider: it is simply not part of the chain
  if (!apiKey) return null
  const baseURL = provider.baseURL()
  // A provider whose URL needs more configuration than it has stays out too
  if (!baseURL) return null
  const existing = clients.get(name)
  if (existing) return existing
  const created = new OpenAI({
    apiKey,
    baseURL,
    // OpenRouter attributes traffic by these; harmless elsewhere
    defaultHeaders: { 'HTTP-Referer': 'https://swedish-vocab-chi.vercel.app', 'X-Title': 'Vocab' },
  })
  clients.set(name, created)
  return created
}

/** Re-encodes the SDK's chunks as the plain text the browser reads. */
function toPlainTextStream(chunks: AsyncIterable<StreamChunk>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          const content = chunk.choices[0]?.delta?.content
          if (content) controller.enqueue(encoder.encode(content))
        }
      } catch {
        // Mid-stream failure: the status line is long gone, so the only honest
        // signal left is a stream that ends early
      } finally {
        controller.close()
      }
    },
  })
}

function retryAfterMs(error: unknown): number {
  const headers = (error as { headers?: Headers | Record<string, string> })?.headers
  const raw = headers instanceof Headers
    ? headers.get('retry-after')
    : (headers as Record<string, string> | undefined)?.['retry-after']
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000
}

export async function runChatCompletion(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ body: ReadableStream<Uint8Array>; model: string }> {
  let soonestRetryMs = Number.POSITIVE_INFINITY
  let anyProviderConfigured = false

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    for (const rung of CHAT_CHAIN satisfies ChainEntry[]) {
      const client = clientFor(rung.provider)
      if (!client) continue
      anyProviderConfigured = true

      const key = rungKey(rung)
      const cooling = cooldownRemainingMs(key)
      if (cooling > 0) {
        soonestRetryMs = Math.min(soonestRetryMs, cooling)
        continue
      }
      try {
        const stream = await client.chat.completions.create(
          {
            model: rung.model,
            messages,
            stream: true,
            max_completion_tokens: COMPLETION_MAX_TOKENS,
            temperature: TEMPERATURE,
          },
          // Taking the retry policy back from the SDK — see lib/chat/models.ts
          { signal, maxRetries: 0, timeout: ATTEMPT_TIMEOUT_MS },
        )
        return { body: toPlainTextStream(stream as unknown as AsyncIterable<StreamChunk>), model: key }
      } catch (error) {
        const status = (error as { status?: number })?.status
        // A rejected key kills this provider, not the whole chain — the other
        // one may still be able to answer
        if (status === 401 || status === 403) {
          setCooldown(key, 10 * 60_000)
          continue
        }
        if (status === 429) {
          const wait = retryAfterMs(error)
          setCooldown(key, wait)
          soonestRetryMs = Math.min(soonestRetryMs, wait)
        }
        // Any other failure: try the next rung rather than give up
      }
    }
    if (!anyProviderConfigured) throw new ChatUnavailableError('no provider key configured')

    // The short queue: worth waiting only if a model frees up almost at once
    const wait = Math.min(soonestRetryMs, WAIT_CAP_MS)
    if (pass < MAX_PASSES - 1 && wait <= WAIT_CAP_MS) {
      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }

  const suggest = Number.isFinite(soonestRetryMs) ? soonestRetryMs : WAIT_CAP_MS
  throw new ChatSaturatedError(Math.max(1, Math.ceil(suggest / 1000)))
}
