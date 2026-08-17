import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { auth } from '@/auth'
import { getCourseWithLevel } from '@/lib/current-course'
import { ATTEMPT_TIMEOUT_MS, PROVIDERS, TOPICS_MODEL } from '@/lib/chat/models'
import { fallbackTopics, parseTopics, topicsPrompt } from '@/lib/chat/topics'
import { getStrings } from '@/lib/i18n'

export const runtime = 'nodejs'
export const maxDuration = 15

// Three openers cost ~150 tokens against ~800 for a real turn, and this call
// runs while the learner reads the screen — so its latency is free. Failure is
// never fatal: the written pool takes over and the conversation still opens.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { course, level } = await getCourseWithLevel(session.user.id)
  const fallback = fallbackTopics(course.native, level)

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ topics: fallback, generated: false })

  // Seeded on the day and the learner, or every learner gets the same three
  const seed = `${new Date().toISOString().slice(0, 10)}-${session.user.id.slice(-6)}`
  const nativeName = getStrings('en').languageName[course.native]

  try {
    const groq = new OpenAI({ apiKey, baseURL: PROVIDERS.groq.baseURL() })
    const completion = await groq.chat.completions.create(
      {
        model: TOPICS_MODEL,
        messages: [{ role: 'user', content: topicsPrompt(nativeName, level, seed) }],
        max_completion_tokens: 120,
        temperature: 1,
      },
      { maxRetries: 0, timeout: ATTEMPT_TIMEOUT_MS },
    )
    const topics = parseTopics(completion.choices[0]?.message?.content ?? '')
    return NextResponse.json(
      topics.length === 3 ? { topics, generated: true } : { topics: fallback, generated: false },
    )
  } catch {
    return NextResponse.json({ topics: fallback, generated: false })
  }
}
