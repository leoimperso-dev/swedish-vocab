// Providers, chain, and the numbers that keep a turn affordable.
//
// Groq decommissioned llama-3.3-70b-versatile and llama-3.1-8b-instant on
// 2026-08-17, hours after `scripts/bench-chat-models.ts` scored them 8/8 and
// 7/8 on corrections. Cloudflare still serves the same 70B, so the chain now
// leads with it and the conversation never noticed. That is the case for a
// second provider, made by events rather than by argument.
//
// What remains on Groq (gpt-oss) converses but does not correct — 3/8, missing
// the mistake five times out of five — so it is a last resort, not a peer.

// Every provider is addressed through the OpenAI protocol, so one client type
// serves them all. The vendor SDKs cannot: groq-sdk hardcodes the request path
// (`/openai/v1/chat/completions`), so pointing it at another host produces a
// 404 rather than a call — which is exactly how this was found.
export interface Provider {
  envKey: string
  // Resolved at client creation: Cloudflare puts the account id in the path,
  // so the URL is not a constant. Returning undefined disables the provider.
  baseURL: () => string | undefined
}

export const PROVIDERS: Record<string, Provider> = {
  groq: { envKey: 'GROQ_API_KEY', baseURL: () => 'https://api.groq.com/openai/v1' },
  cloudflare: {
    envKey: 'CLOUDFLARE_API_TOKEN',
    baseURL: () => {
      const account = process.env.CLOUDFLARE_ACCOUNT_ID
      return account ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1` : undefined
    },
  },
  // Paid, and optional: only used by whoever puts credits on it
  openrouter: { envKey: 'OPENROUTER_API_KEY', baseURL: () => 'https://openrouter.ai/api/v1' },
}

export interface ChainEntry {
  provider: keyof typeof PROVIDERS & string
  model: string
}

export const CHAT_CHAIN: ChainEntry[] = [
  // Scores are from scripts/bench-chat-models.ts, 8 cases across four languages
  // including 3 already-correct sentences to catch invented corrections.
  { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }, // 8/8, 884ms
  // Same provider, but a real quality rung: without it the next step down is a
  // bot that converses and silently stops correcting, which is the worst
  // failure mode here because nothing looks broken.
  { provider: 'cloudflare', model: '@cf/meta/llama-4-scout-17b-16e-instruct' }, // 7/8, 668ms
  // Different provider, so the chain survives losing Cloudflare entirely —
  // at the cost of corrections: gpt-oss misses the mistake 5 times out of 5.
  { provider: 'groq', model: 'openai/gpt-oss-120b' }, // 3/8
  { provider: 'groq', model: 'openai/gpt-oss-20b' }, // 3/8
]

// Openers are throwaway text — no reason to spend the good model on them
export const TOPICS_MODEL = 'openai/gpt-oss-20b'

// Replies are the other half of the token budget, with the history window
export const COMPLETION_MAX_TOKENS = 200
// Measured on the hardest case (Swedish V2 inversion), 8 runs each: the
// correction line appeared 6/8 at 0.6 and 7/8 at 0.3. Warmth is worth little
// next to catching the mistake, and an invented correction never appeared at
// any setting — so the error this trades against is benign.
export const TEMPERATURE = 0.4

// The SDK defaults to 2 retries and a 60s timeout. Left alone, one saturated
// model would eat the whole function budget before the next one is tried, so
// the retry policy is taken back from it here.
export const ATTEMPT_TIMEOUT_MS = 6000
export const MAX_PASSES = 2

// Never sleep for a raw retry-after: Groq can answer 60s, far past any
// serverless budget. Beyond this the client is told to wait instead — it has
// no timeout to respect.
export const WAIT_CAP_MS = 3000

// History window: the only tunable lever on throughput. Six messages at ~60
// tokens keeps a turn near 800 tokens all-in.
export const HISTORY_MAX_MESSAGES = 6
export const HISTORY_MSG_MAX_CHARS = 300
export const MESSAGE_MAX_CHARS = 400

// A rung that just returned 429 is skipped until its window resets. Keyed by
// provider and model, since the same model on two providers has two budgets.
// Module memory only, so it is per-instance and best-effort — a shared table
// would cost a query on every turn to save an occasional wasted call.
const cooldowns = new Map<string, number>()

export function rungKey(entry: ChainEntry): string {
  return `${entry.provider}:${entry.model}`
}

export function cooldownRemainingMs(model: string): number {
  const until = cooldowns.get(model)
  if (!until) return 0
  const left = until - Date.now()
  if (left <= 0) {
    cooldowns.delete(model)
    return 0
  }
  return left
}

export function setCooldown(model: string, ms: number): void {
  cooldowns.set(model, Date.now() + ms)
}
