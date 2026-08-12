'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// The Web Speech recognition API is still vendor-prefixed in Chrome and absent
// from Firefox — minimal typings, since TS does not ship them.
interface RecognitionAlternative { transcript: string; confidence: number }
interface RecognitionResult {
  0: RecognitionAlternative
  isFinal: boolean
  length: number
}
interface RecognitionEvent extends Event {
  results: { length: number; [i: number]: RecognitionResult }
  resultIndex: number
}
interface RecognitionErrorEvent extends Event { error: string }
interface Recognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function getConstructor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isRecognitionSupported(): boolean {
  return getConstructor() !== null
}

export type RecognitionError = 'not-allowed' | 'no-speech' | 'unsupported' | 'other'

/**
 * Captures one spoken answer at a time and returns its transcript.
 * Recognition runs on the browser's engine (Chrome sends audio to Google),
 * so callers must offer a typed fallback — see isRecognitionSupported.
 */
export function useSpeechRecognition(locale: string) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<RecognitionError | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  // A stopped-by-us session must not report its late "no-speech" error
  const cancelledRef = useRef(false)

  const stop = useCallback(() => {
    cancelledRef.current = true
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    const Ctor = getConstructor()
    if (!Ctor) {
      setError('unsupported')
      return
    }
    recognitionRef.current?.abort()
    cancelledRef.current = false
    setTranscript('')
    setInterim('')
    setError(null)

    const recognition = new Ctor()
    recognition.lang = locale
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onresult = e => {
      let final = ''
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) final += result[0].transcript
        else pending += result[0].transcript
      }
      if (final) setTranscript(prev => (prev + ' ' + final).trim())
      setInterim(pending)
    }
    recognition.onerror = e => {
      if (cancelledRef.current) return
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'not-allowed'
          : e.error === 'no-speech'
          ? 'no-speech'
          : 'other',
      )
      setListening(false)
    }
    recognition.onend = () => {
      setListening(false)
      setInterim('')
    }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }, [locale])

  useEffect(() => stop, [stop])

  return { start, stop, listening, transcript, interim, error, reset: () => setTranscript('') }
}
