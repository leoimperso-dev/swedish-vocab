'use client'

import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import {
  DEFAULT_RATE, RATE_BOUNDS, allVoices, filtersNaturalOnly, getPreferredVoiceUri, getRate,
  setPreferredVoiceUri, setRate, speak, unlock, voicesFor,
} from '@/lib/tts'
import {
  getServerVoice, serverAudioEnabled, serverAudioPossible, setServerAudioEnabled, setServerVoice,
} from '@/lib/tts/player'
import { voicesForLang } from '@/lib/tts/catalog'
import { LANGS, localeOf, type Lang } from '@/lib/courses'
import { useCourse } from '@/components/CourseProvider'
import { getStrings } from '@/lib/i18n'

// Read in the language being tested, so the sample is judged on the accent
const SAMPLE: Record<Lang, string> = {
  fr: "Bonjour, voici à quoi je ressemble.",
  sv: 'Hej, så här låter jag.',
  en: 'Hello, this is what I sound like.',
  nl: 'Hallo, zo klink ik.',
  es: 'Hola, así es como sueno.',
}

/** "Google svenska — sv-SE, en ligne" — enough to tell two voices apart. */
function describe(voice: SpeechSynthesisVoice, onlineLabel: string): string {
  const tags = [voice.lang.replace('_', '-')]
  if (!voice.localService) tags.push(onlineLabel)
  return `${voice.name} — ${tags.join(', ')}`
}

export function VoiceSettings() {
  const course = useCourse()
  const t = getStrings(course.native)
  // Every language of the app, the two of the current course first: a voice
  // chosen here survives a course switch
  const langs = [...new Set<Lang>([course.learned, course.native, ...LANGS])]
  // The voice list loads asynchronously, and again when the OS installs one
  const [ready, setReady] = useState(0)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [rate, setRateState] = useState(DEFAULT_RATE)
  const [showAll, setShowAll] = useState(false)
  const [serverOn, setServerOn] = useState(false)
  const [serverChoices, setServerChoices] = useState<Record<string, string>>({})

  useEffect(() => {
    setServerOn(serverAudioEnabled())
    setServerChoices(
      Object.fromEntries(LANGS.map(l => [l, getServerVoice(localeOf(l)) ?? ''])),
    )
  }, [])

  useEffect(() => {
    const bump = () => setReady(n => n + 1)
    bump()
    setRateState(getRate())
    window.speechSynthesis?.addEventListener('voiceschanged', bump)
    // Android does not always fire `voiceschanged`: the engine is bound lazily
    // and the list simply appears a moment later. Without this poll the picker
    // stays empty for good, and the learner concludes their downloaded voices
    // are not seen at all.
    const poll = setInterval(bump, 400)
    const stop = setTimeout(() => clearInterval(poll), 4000)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', bump)
      clearInterval(poll)
      clearTimeout(stop)
    }
  }, [])

  useEffect(() => {
    setChoices(Object.fromEntries(langs.map(l => [l, getPreferredVoiceUri(localeOf(l)) ?? ''])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, course.learned, course.native])

  const everyVoice = allVoices()

  return (
    <div className="space-y-4">
      {/* Speaking rate — the same complaint as a bad voice, half the time */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-muted-foreground">{t.voiceSpeed}</p>
          <span className="text-xs tabular-nums text-muted-foreground">×{rate.toFixed(2)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="range"
            min={RATE_BOUNDS.min}
            max={RATE_BOUNDS.max}
            step={RATE_BOUNDS.step}
            value={rate}
            onChange={e => {
              const next = Number(e.target.value)
              setRateState(next)
              setRate(next)
            }}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <button
            type="button"
            onClick={() => {
              unlock()
              speak(SAMPLE[course.learned], localeOf(course.learned))
            }}
            aria-label={t.voiceTest}
            className="pressable grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-primary"
          >
            <Volume2 size={17} />
          </button>
        </div>
      </div>

      {/* Server-rendered audio first: it is the only voice the learner can
          actually choose on iOS, where the device list is whatever Safari
          decides to expose. */}
      {serverAudioPossible() && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
          <div>
            <p className="text-xs font-semibold text-foreground">{t.serverVoiceTitle}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.serverVoiceHint}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={serverOn}
              onChange={e => {
                setServerOn(e.target.checked)
                setServerAudioEnabled(e.target.checked)
              }}
              className="size-4 cursor-pointer accent-primary"
            />
            {t.serverVoiceOn}
          </label>

          {serverOn && langs.map(lang => {
            const locale = localeOf(lang)
            const options = voicesForLang(locale)
            if (options.length === 0) return null
            return (
              <div key={lang}>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  {t.languageName[lang]}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={serverChoices[lang] ?? ''}
                    onChange={e => {
                      setServerVoice(locale, e.target.value || null)
                      setServerChoices(prev => ({ ...prev, [lang]: e.target.value }))
                    }}
                    className="min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {options.map(v => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      unlock()
                      speak(SAMPLE[lang], locale)
                    }}
                    aria-label={t.voiceTest}
                    className="pressable grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-primary"
                  >
                    <Volume2 size={17} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-foreground">{t.deviceVoiceTitle}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t.deviceVoiceHint}</p>
      </div>

      {langs.map(lang => {
        const locale = localeOf(lang)
        const matching = voicesFor(locale)
        const listed = showAll ? everyVoice : matching
        // A voice chosen before the list narrowed must stay selectable, or the
        // select would show an option that is not there
        const chosen = choices[lang]
        const voices = chosen && !listed.some(v => v.voiceURI === chosen)
          ? [...listed, ...everyVoice.filter(v => v.voiceURI === chosen)]
          : listed
        return (
          <div key={lang}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {t.languageName[lang]}
              {matching.length > 0 && (
                <span className="ml-1.5 font-normal text-muted-foreground/70 tabular-nums">
                  {t.voiceCount(matching.length)}
                </span>
              )}
            </p>
            {voices.length === 0 ? (
              <p className="text-xs text-warning">{t.voiceNone}</p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={choices[lang] ?? ''}
                  onChange={e => {
                    const uri = e.target.value
                    setPreferredVoiceUri(locale, uri || null)
                    setChoices(prev => ({ ...prev, [lang]: uri }))
                  }}
                  className="min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">{t.voiceAutomatic}</option>
                  {voices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {describe(v, t.voiceOnline)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    unlock()
                    speak(SAMPLE[lang], locale)
                  }}
                  aria-label={t.voiceTest}
                  className="pressable grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-primary"
                >
                  <Volume2 size={17} />
                </button>
              </div>
            )}
            {filtersNaturalOnly(locale) && !showAll && matching.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground/70">{t.voiceNaturalOnly}</p>
            )}
          </div>
        )
      })}

      {/* An empty list is almost never "no voice installed": on Android the
          engine is only bound after something has been spoken, and speaking
          needs a tap to count as a user gesture. */}
      {everyVoice.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-warning">{t.voiceNoneFound}</p>
          <button
            type="button"
            onClick={() => {
              unlock()
              speak(SAMPLE[course.learned], localeOf(course.learned))
              // The list usually appears within a second of the first utterance
              setTimeout(() => setReady(n => n + 1), 600)
              setTimeout(() => setReady(n => n + 1), 1800)
            }}
            className="pressable rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary"
          >
            {t.voiceWakeEngine}
          </button>
        </div>
      )}

      {everyVoice.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="size-4 cursor-pointer accent-primary"
          />
          {t.voiceShowAll(everyVoice.length)}
        </label>
      )}
      {/* The raw list, exactly as the browser reports it. Which voices a device
          exposes to a web page is decided by the OS — iOS keeps its Siri voices
          to itself — so when the picker looks wrong this is what settles
          whether the app is filtering something out or the voice was never
          offered in the first place. */}
      {showAll && everyVoice.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-[11px] font-semibold text-muted-foreground">{t.voiceDetected(everyVoice.length)}</p>
          <ul className="mt-1 space-y-0.5">
            {everyVoice.map(voice => (
              <li key={voice.voiceURI} className="text-[11px] leading-snug text-muted-foreground/80">
                {voice.name} — {voice.lang.replace('_', '-')}{voice.localService ? '' : ` · ${t.voiceOnline}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t.voiceExplainer}</p>
    </div>
  )
}
