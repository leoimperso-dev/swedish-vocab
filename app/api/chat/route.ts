import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCourseWithLevel } from '@/lib/current-course'
import { buildSystemPrompt } from '@/lib/chat/prompt'
import { HISTORY_MAX_MESSAGES, HISTORY_MSG_MAX_CHARS, MESSAGE_MAX_CHARS } from '@/lib/chat/models'
import { ChatSaturatedError, ChatUnavailableError, runChatCompletion, type ChatMessage } from '@/lib/chat/stream'
import { releaseChatTurn, reserveChatTurn } from '@/lib/chat/usage'

// groq-sdk and the Prisma pg adapter both need Node, not the Edge runtime
export const runtime = 'nodejs'
// Worst case: two passes over three models at 6s, plus one 3s wait
export const maxDuration = 30

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * The window the server is willing to pay for, whatever the client sent. The
 * history lives in the browser — there is no session affinity to rebuild it
 * from — so it is re-truncated here rather than trusted.
 */
function boundedHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is Turn =>
      !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .slice(-HISTORY_MAX_MESSAGES)
    .map(t => ({ role: t.role, content: t.content.slice(0, HISTORY_MSG_MAX_CHARS) }))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MESSAGE_MAX_CHARS) : ''
  if (!message) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  const topic = typeof body?.topic === 'string' ? body.topic.slice(0, 120) : null

  const reservation = await reserveChatTurn(userId)
  if (!reservation.ok) {
    return NextResponse.json(
      reservation.reason === 'too_fast'
        ? { error: 'too_fast', retryAfterSec: reservation.retryAfterSec }
        : { error: 'daily_limit', limit: reservation.limit },
      { status: 429 },
    )
  }

  const { course, level } = await getCourseWithLevel(userId)
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(course.learned, course.native, level, topic) },
    ...boundedHistory(body?.history),
    { role: 'user', content: message },
  ]

  try {
    // Resolved before any Response is built: once a 200 is streaming, an error
    // can no longer be reported (see lib/chat/stream.ts)
    const { body: stream, model } = await runChatCompletion(messages, req.signal)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Chat-Model': model,
      },
    })
  } catch (error) {
    // The learner got nothing — their daily quota should not pay for it
    await releaseChatTurn(userId)
    if (error instanceof ChatSaturatedError) {
      return NextResponse.json(
        { error: 'saturated', retryAfterSec: error.retryAfterSec },
        { status: 503, headers: { 'Retry-After': String(error.retryAfterSec) } },
      )
    }
    if (error instanceof ChatUnavailableError) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    }
    console.error('Chat route error:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
