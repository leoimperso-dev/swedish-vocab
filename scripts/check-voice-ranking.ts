// Guards which voice the app speaks with when the learner has not chosen one.
//
// The ranking decides what every user hears by default, and it is the kind of
// weighting that silently regresses: a legacy exact-region voice used to beat a
// natural one from a neighbouring region, so a Windows machine read English
// with Microsoft Hazel instead of Jenny. These are the voice lists of real
// devices, and the voice each one must settle on.
//
// Usage: pnpm tsx scripts/check-voice-ranking.ts
import { voiceScore } from '../lib/tts'

type FakeVoice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI' | 'localService' | 'default'>

const voice = (name: string, lang: string, opts: { local?: boolean; def?: boolean } = {}): FakeVoice => ({
  name,
  lang,
  voiceURI: name,
  localService: opts.local ?? false,
  default: opts.def ?? false,
})

// Windows + Edge: the "Online (Natural)" family alongside the legacy SAPI voices
const EDGE_WINDOWS: FakeVoice[] = [
  voice('Microsoft David - English (United States)', 'en-US', { local: true, def: true }),
  voice('Microsoft Zira - English (United States)', 'en-US', { local: true }),
  voice('Microsoft Hazel - English (United Kingdom)', 'en-GB', { local: true }),
  voice('Microsoft Jenny Online (Natural) - English (United States)', 'en-US'),
  voice('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'),
  voice('Microsoft Mattias Online (Natural) - Swedish (Sweden)', 'sv-SE'),
  voice('Microsoft Bengt - Swedish (Sweden)', 'sv-SE', { local: true, def: true }),
  voice('Microsoft Remy Multilingual Online (Natural) - French (France)', 'fr-FR'),
  voice('Microsoft Hortense - French (France)', 'fr-FR', { local: true, def: true }),
  voice('Microsoft Fenna Online (Natural) - Dutch (Netherlands)', 'nl-NL'),
  voice('Microsoft Alvaro Online (Natural) - Spanish (Spain)', 'es-ES'),
  voice('Microsoft Helena - Spanish (Spain)', 'es-ES', { local: true, def: true }),
]

// iPhone: quality lives in the URI, not the name
const IOS: FakeVoice[] = [
  { ...voice('Daniel', 'en-GB', { local: true, def: true }), voiceURI: 'com.apple.ttsbundle.Daniel-compact' },
  { ...voice('Daniel', 'en-GB', { local: true }), voiceURI: 'com.apple.voice.premium.en-GB.Daniel' },
  { ...voice('Samantha', 'en-US', { local: true }), voiceURI: 'com.apple.ttsbundle.Samantha-compact' },
]

// Chrome without the Edge voices: only Google's network voices are decent
const CHROME: FakeVoice[] = [
  voice('Microsoft David - English (United States)', 'en-US', { local: true, def: true }),
  voice('Google UK English Female', 'en-GB'),
  voice('Google svenska', 'sv-SE'),
  voice('Microsoft Bengt - Swedish (Sweden)', 'sv-SE', { local: true }),
]

const CASES: Array<[label: string, voices: FakeVoice[], locale: string, expected: string]> = [
  // A natural voice from another region beats a legacy voice of the exact one
  ['Edge/Windows anglais', EDGE_WINDOWS, 'en-GB', 'Microsoft Sonia Online (Natural) - English (United Kingdom)'],
  ['Edge/Windows suédois', EDGE_WINDOWS, 'sv-SE', 'Microsoft Mattias Online (Natural) - Swedish (Sweden)'],
  ['Edge/Windows français', EDGE_WINDOWS, 'fr-FR', 'Microsoft Remy Multilingual Online (Natural) - French (France)'],
  ['Edge/Windows néerlandais', EDGE_WINDOWS, 'nl-NL', 'Microsoft Fenna Online (Natural) - Dutch (Netherlands)'],
  ['Edge/Windows espagnol', EDGE_WINDOWS, 'es-ES', 'Microsoft Alvaro Online (Natural) - Spanish (Spain)'],
  // Apple marks quality in the URI only
  ['iPhone anglais', IOS, 'en-GB', 'Daniel'],
  // No natural voice installed: Google's network voice, not the default SAPI one
  ['Chrome anglais', CHROME, 'en-GB', 'Google UK English Female'],
  ['Chrome suédois', CHROME, 'sv-SE', 'Google svenska'],
]

let failures = 0
for (const [label, voices, locale, expected] of CASES) {
  const best = [...voices].sort(
    (a, b) => voiceScore(b as SpeechSynthesisVoice, locale) - voiceScore(a as SpeechSynthesisVoice, locale)
      || a.name.localeCompare(b.name),
  )[0]
  const ok = best.name === expected
  // iOS repeats a name across qualities — check the URI settles on the premium one
  const uriOk = label.startsWith('iPhone') ? best.voiceURI.includes('premium') : true
  if (!ok || !uriOk) {
    failures++
    console.error(`ÉCHEC  ${label} → ${best.name} (${best.voiceURI}), attendu ${expected}`)
  }
}
console.log(failures === 0 ? `${CASES.length} cas OK` : `${failures}/${CASES.length} échecs`)
process.exit(failures === 0 ? 0 : 1)
