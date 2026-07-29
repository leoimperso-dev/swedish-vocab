// Shared formatting for word forms and enrichment details

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
