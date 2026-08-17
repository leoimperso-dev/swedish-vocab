'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Mic, Send, Square, Volume2, Sparkles, RefreshCw } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { localeOf } from '@/lib/courses'
import { speak, unlock } from '@/lib/tts'
import { useMissingVoice } from '@/lib/use-speech-queue'
import { isRecognitionSupported, useSpeechRecognition } from '@/lib/use-speech-recognition'
import { splitCorrection } from '@/lib/chat/prompt'
import { diffWords } from '@/lib/chat/diff'
import { AppShell } from '@/components/AppShell'
import { Card, TextField } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  // Only ever set on an assistant message, and never spoken aloud
  correction?: string
}

/**
 * The corrected sentence with the words that actually changed picked out, so
 * the mistake is visible at a glance instead of hidden in a full rewrite. The
 * reason after the dash is left as prose.
 */
function Correction({ said, correction, label }: { said: string; correction: string; label: string }) {
  const dash = correction.indexOf(' — ')
  const sentence = dash === -1 ? correction : correction.slice(0, dash)
  const reason = dash === -1 ? '' : correction.slice(dash + 3)
  const parts = diffWords(said, sentence)

  return (
    <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
      <span className="font-semibold">{label} · </span>
      {parts.map((part, i) => (
        <span
          key={i}
          className={cn(
            part.kind === 'removed' && 'text-danger line-through decoration-danger/60',
            part.kind === 'added' && 'rounded bg-success/20 px-0.5 font-semibold text-success',
          )}
        >
          {part.text}{' '}
        </span>
      ))}
      {reason && <span className="text-warning/80">— {reason}</span>}
    </p>
  )
}

export default function ChatPlayer({ initialTopics }: { initialTopics: string[] }) {
  const course = useCourse()
  const t = getStrings(course.native)
  const locale = localeOf(course.learned)
  const missingVoice = useMissingVoice(locale)

  const [topics, setTopics] = useState(initialTopics)
  const [topic, setTopic] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [ownTopic, setOwnTopic] = useState('')

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const { start, stop, cancel, listening, transcript, interim, reset } = useSpeechRecognition(locale)
  const canSpeak = isRecognitionSupported()

  const [loadingTopics, setLoadingTopics] = useState(false)

  const loadTopics = useCallback(() => {
    setLoadingTopics(true)
    fetch('/api/chat/topics')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.topics) && data.topics.length === 3) setTopics(data.topics) })
      .catch(() => {})
      .finally(() => setLoadingTopics(false))
  }, [])

  // The model writes three fresh openers while this screen is being read, so
  // its latency costs nothing; the server-rendered pool covers a failure
  useEffect(() => {
    if (!started) loadTopics()
  }, [started, loadTopics])

  useEffect(() => { if (transcript) setInput(transcript) }, [transcript])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    cancel()
    reset()
    setInput('')
    setNotice(null)
    setBusy(true)

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: message }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, topic }),
      })

      if (!res.headers.get('content-type')?.includes('text/plain')) {
        const data = await res.json().catch(() => ({}))
        setNotice(
          data.error === 'saturated' ? t.chatSaturated(data.retryAfterSec ?? 5)
            : data.error === 'daily_limit' ? t.chatDailyLimit(data.limit ?? 60)
            : data.error === 'too_fast' ? t.chatTooFast
            : t.chatUnavailable,
        )
        setBusy(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])
      setBusy(false)

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
        // Held back mid-marker so a correction never flashes as reply text
        const { reply, correction } = splitCorrection(raw)
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: reply, correction: correction || undefined }
          return next
        })
      }

      const { reply } = splitCorrection(raw)
      if (reply) speak(reply, locale)
      else setNotice(t.chatInterrupted)
    } catch {
      setNotice(t.chatInterrupted)
      setBusy(false)
    }
  }, [busy, cancel, messages, reset, t, topic, locale])

  const begin = (chosen: string | null) => {
    unlock()
    setTopic(chosen)
    setStarted(true)
  }

  if (!started) {
    return (
      <AppShell title={t.chatTitle} subtitle={t.chatDesc}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.chatPickTopic}</p>
          <div className="space-y-2">
            {topics.map(item => (
              <button
                key={item}
                onClick={() => begin(item)}
                className="pressable card-surface flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-primary">
                  <Sparkles size={17} />
                </span>
                <span className="min-w-0 flex-1 font-display text-[15px] font-semibold">{item}</span>
              </button>
            ))}
          </div>

          <Card className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">{t.chatOtherTopic}</p>
            <TextField
              value={ownTopic}
              onChange={e => setOwnTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ownTopic.trim() && begin(ownTopic.trim())}
              placeholder={t.chatOtherPlaceholder}
            />
            <Button className="w-full" disabled={!ownTopic.trim()} onClick={() => begin(ownTopic.trim())}>
              {t.chatStartTopic}
            </Button>
          </Card>

          {/* Stacked, each full width: button labels carry whitespace-nowrap, so
              two side by side cannot shrink and overflow a narrow phone */}
          <div className="grid gap-2">
            <Button variant="secondary" className="w-full" disabled={loadingTopics} onClick={loadTopics}>
              <RefreshCw size={15} className={loadingTopics ? 'animate-spin' : undefined} />
              <span className="truncate">{t.chatNewTopics}</span>
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => begin(null)}>
              <span className="truncate">{t.chatNoTopic}</span>
            </Button>
          </div>

          <Link href="/conversation" className="pressable block text-center text-sm text-muted-foreground">
            {t.back}
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={t.chatTitle} subtitle={topic ?? t.chatDesc}>
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className="max-w-[85%] space-y-1.5">
              <div
                className={cn(
                  'rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug break-words',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-surface text-foreground',
                )}
              >
                {m.content || '…'}
              </div>
              {m.role === 'assistant' && m.content && (
                <button
                  onClick={() => { unlock(); speak(m.content, locale) }}
                  aria-label={t.listen}
                  className="pressable inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <Volume2 size={12} /> {t.listen}
                </button>
              )}
              {m.correction && (
                <Correction
                  // The message being corrected is the learner's, just before
                  said={messages[i - 1]?.role === 'user' ? messages[i - 1].content : ''}
                  correction={m.correction}
                  label={t.chatCorrection}
                />
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-center text-xs text-muted-foreground">…</p>}
        {notice && (
          <p className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-center text-xs text-danger">
            {notice}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-20 mt-4 space-y-2 bg-background/85 py-2 backdrop-blur-xl">
        {listening && interim && <p className="text-xs italic text-muted-foreground">{interim}</p>}
        <div className="flex items-end gap-2">
          {canSpeak && (
            <button
              onClick={() => { unlock(); listening ? stop() : start() }}
              aria-label={t.tapToSpeak}
              className={cn(
                'pressable grid size-11 shrink-0 place-items-center rounded-xl border',
                listening
                  ? 'border-primary/40 bg-info-soft text-primary'
                  : 'border-border bg-surface text-muted-foreground',
              )}
            >
              {listening ? <Square size={15} /> : <Mic size={17} />}
            </button>
          )}
          <TextField
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder={t.chatPlaceholder}
            className="min-w-0 flex-1"
          />
          <Button size="icon" disabled={!input.trim() || busy} onClick={() => send(input)} aria-label={t.submit}>
            <Send size={17} />
          </Button>
        </div>
        {missingVoice && (
          <p className="text-center text-[11px] text-warning">
            {t.noVoiceForLanguage(t.languageName[course.learned])}
          </p>
        )}
      </div>
    </AppShell>
  )
}
