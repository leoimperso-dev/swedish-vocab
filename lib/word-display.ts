// Shared formatting for word forms and enrichment details
import type { Lang } from '@/lib/i18n'

interface BilingualWord {
  swedish: string
  french: string
}

// Translation direction of an exercise session — each has its own SM-2 progression
export type Direction = 'SV_FR' | 'FR_SV'

export function directionPrompt(word: BilingualWord, direction: Direction): string {
  return direction === 'SV_FR' ? word.swedish : word.french
}

export function directionAnswer(word: BilingualWord, direction: Direction): string {
  return direction === 'SV_FR' ? word.french : word.swedish
}

// Default direction shows the learned language as prompt (comprehension)
export function defaultDirection(lang: Lang): Direction {
  return lang === 'fr' ? 'SV_FR' : 'FR_SV'
}

// TTS always pronounces the learned-language side of the word
export function learnedText(word: BilingualWord, lang: Lang): string {
  return lang === 'fr' ? word.swedish : word.french
}

export function learnedLocale(lang: Lang): string {
  return lang === 'fr' ? 'sv-SE' : 'fr-FR'
}

// Display order: verb tenses, then noun plural, then adjective forms
const FORM_ORDER = ['present', 'preterit', 'supine', 'plural', 'ett', 'comparative', 'superlative']

export function formatForms(forms: unknown): string | null {
  if (!forms || typeof forms !== 'object') return null
  const record = forms as Record<string, string>
  const parts = FORM_ORDER.filter(key => record[key]).map(key => record[key])
  return parts.length > 0 ? parts.join(', ') : null
}

export interface WordDetails {
  translations?: string[]
  context?: string
  usage?: Array<{ sv: string; fr: string }>
}

export function parseDetails(details: unknown): WordDetails | null {
  if (!details || typeof details !== 'object') return null
  const d = details as WordDetails
  const translations = Array.isArray(d.translations)
    ? d.translations.filter(t => typeof t === 'string' && t.length > 0)
    : undefined
  const usage = Array.isArray(d.usage)
    ? d.usage.filter(u => u && typeof u.sv === 'string' && typeof u.fr === 'string')
    : undefined
  return {
    translations: translations?.length ? translations : undefined,
    context: typeof d.context === 'string' && d.context.length > 0 ? d.context : undefined,
    usage: usage?.length ? usage : undefined,
  }
}
