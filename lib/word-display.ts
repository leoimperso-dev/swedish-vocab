// Shared formatting for word forms and enrichment details
import { pairOf, promptLang, localeOf, type Course, type Direction } from '@/lib/courses'

// Minimal shape needed to render a word: which pair it belongs to and both sides
interface DisplayWord {
  pair: string
  term: string
  translation: string
}

function isTermSide(word: DisplayWord, lang: string): boolean {
  return pairOf(word.pair).term === lang
}

export function directionPrompt(word: DisplayWord, direction: Direction): string {
  return isTermSide(word, promptLang(direction)) ? word.term : word.translation
}

export function directionAnswer(word: DisplayWord, direction: Direction): string {
  return isTermSide(word, promptLang(direction)) ? word.translation : word.term
}

// TTS always pronounces the side being learned
export function learnedText(word: DisplayWord, course: Course): string {
  return isTermSide(word, course.learned) ? word.term : word.translation
}

export function learnedLocale(course: Course): string {
  return localeOf(course.learned)
}

// Is the prompt the pair's `term` side? Inflected forms belong to that side, so
// this decides where they are shown.
export function promptIsTerm(word: DisplayWord, direction: Direction): boolean {
  return isTermSide(word, promptLang(direction))
}

// Enrichment (alternative translations, usage notes) is authored in the pair's
// `translation` language: only useful to a reader of that language, and only when
// the answer sits on that side.
export function showsEnrichedAnswer(
  word: DisplayWord,
  course: Course,
  direction: Direction,
): boolean {
  return course.native === pairOf(word.pair).translation && promptIsTerm(word, direction)
}

// Display order: verb tenses (Swedish then English), then noun plural, then adjective forms
const FORM_ORDER = [
  'present', 'preterit', 'supine',
  'past', 'pastParticiple',
  'plural', 'ett', 'comparative', 'superlative',
]

export function formatForms(forms: unknown): string | null {
  if (!forms || typeof forms !== 'object') return null
  const record = forms as Record<string, string>
  const parts = FORM_ORDER.filter(key => record[key]).map(key => record[key])
  return parts.length > 0 ? parts.join(', ') : null
}

export interface WordDetails {
  translations?: string[]
  context?: string
  usage?: Array<{ term: string; translation: string }>
}

export function parseDetails(details: unknown): WordDetails | null {
  if (!details || typeof details !== 'object') return null
  const d = details as WordDetails
  const translations = Array.isArray(d.translations)
    ? d.translations.filter(t => typeof t === 'string' && t.length > 0)
    : undefined
  const usage = Array.isArray(d.usage)
    ? d.usage.filter(u => u && typeof u.term === 'string' && typeof u.translation === 'string')
    : undefined
  return {
    translations: translations?.length ? translations : undefined,
    context: typeof d.context === 'string' && d.context.length > 0 ? d.context : undefined,
    usage: usage?.length ? usage : undefined,
  }
}
