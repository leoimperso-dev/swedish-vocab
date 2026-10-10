// Language registry.
//
// Two distinct notions:
// - a PAIR is unoriented and owns the content (Word, Story, GrammarLesson).
//   The same "hus — maison" row serves both a French speaker learning Swedish
//   and a Swedish speaker learning French, so content is never duplicated.
// - a COURSE is oriented and belongs to the user: which language the interface
//   speaks (native) and which one is being learned. It is derived from
//   User.nativeLanguage + User.learningLanguage, not stored as its own entity.

export type Lang = 'fr' | 'sv' | 'en' | 'nl' | 'es' | 'de'

// Every language the app touches, for the settings that are not course-scoped
export const LANGS: readonly Lang[] = ['fr', 'sv', 'en', 'nl', 'es', 'de']

export type PairId = 'sv-fr' | 'en-fr' | 'nl-fr' | 'es-fr' | 'de-fr'

export interface Pair {
  term: Lang // language of Word.term / Story.title
  translation: Lang // language of Word.translation / Story.titleTranslated
}

export const PAIRS: Record<PairId, Pair> = {
  'sv-fr': { term: 'sv', translation: 'fr' },
  'en-fr': { term: 'en', translation: 'fr' },
  'nl-fr': { term: 'nl', translation: 'fr' },
  'es-fr': { term: 'es', translation: 'fr' },
  'de-fr': { term: 'de', translation: 'fr' },
}

export const DEFAULT_PAIR: PairId = 'sv-fr'

// Rows carry `pair` as a plain string, so narrow it before use
export function asPairId(value: string | null | undefined): PairId {
  return value === 'sv-fr' || value === 'en-fr' || value === 'nl-fr' || value === 'es-fr' || value === 'de-fr' ? value : DEFAULT_PAIR
}

export function pairOf(value: string | null | undefined): Pair {
  return PAIRS[asPairId(value)]
}

export interface Course {
  native: Lang // interface language
  learned: Lang
  pair: PairId
}

// Dutch has no interface strings yet, so no nl-native course
export const COURSES: Course[] = [
  { native: 'fr', learned: 'sv', pair: 'sv-fr' },
  { native: 'fr', learned: 'en', pair: 'en-fr' },
  { native: 'fr', learned: 'nl', pair: 'nl-fr' },
  { native: 'fr', learned: 'es', pair: 'es-fr' },
  { native: 'fr', learned: 'de', pair: 'de-fr' },
  { native: 'sv', learned: 'fr', pair: 'sv-fr' },
  { native: 'en', learned: 'fr', pair: 'en-fr' },
  { native: 'de', learned: 'fr', pair: 'de-fr' },
]

export const DEFAULT_COURSE: Course = COURSES[0]

// User.nativeLanguage is a plain string in the DB — narrow before use
export function asLangOrDefault(value: string | null | undefined): Lang {
  return COURSES.some(c => c.native === value) ? (value as Lang) : DEFAULT_COURSE.native
}

// Translation direction of an exercise — absolute, so each keeps its own SM-2
// progression regardless of which side the user reads the interface in.
export type Direction = 'SV_FR' | 'FR_SV' | 'EN_FR' | 'FR_EN' | 'DE_FR' | 'FR_DE'

// What the learner asked a session to drill. 'MIXED' is not a direction: it
// draws each card in the direction it is actually scheduled in, so one session
// can ask "hus → ?" and "maison → ?" about different words.
export type DirectionChoice = Direction | 'MIXED'

export function directionFor(from: Lang, to: Lang): Direction {
  return `${from.toUpperCase()}_${to.toUpperCase()}` as Direction
}

const DIRECTIONS = new Set<string>(
  Object.values(PAIRS).flatMap(p => [
    directionFor(p.term, p.translation),
    directionFor(p.translation, p.term),
  ]),
)

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && DIRECTIONS.has(value)
}

export function resolveCourse(
  nativeLanguage: string | null | undefined,
  learningLanguage: string | null | undefined,
): Course {
  return (
    COURSES.find(c => c.native === nativeLanguage && c.learned === learningLanguage) ??
    DEFAULT_COURSE
  )
}

export function coursesFor(native: Lang): Course[] {
  return COURSES.filter(c => c.native === native)
}

// A direction reads "<prompt>_<answer>"
export function promptLang(direction: Direction): Lang {
  return direction.split('_')[0].toLowerCase() as Lang
}

export function answerLang(direction: Direction): Lang {
  return direction.split('_')[1].toLowerCase() as Lang
}

// The two directions available in a course, native-first (production mode) first
export function courseDirections(course: Course): [Direction, Direction] {
  return [directionFor(course.native, course.learned), directionFor(course.learned, course.native)]
}

export function defaultDirection(course: Course): Direction {
  return courseDirections(course)[0]
}

/** Narrows a request parameter to one of the course's directions, or 'MIXED'. */
export function asDirectionChoice(course: Course, value: string | null | undefined): DirectionChoice {
  if (value === 'MIXED') return 'MIXED'
  return courseDirections(course).find(d => d === value) ?? defaultDirection(course)
}

// True when the user studies the pair's `term` side. Enriched content —
// verb forms, Tatoeba sentences, stories, grammar lessons — is authored for
// that side only, so conjugation, cloze, reading and grammar hang off this.
export function learnsTermLanguage(course: Course): boolean {
  return course.learned === PAIRS[course.pair].term
}

// BCP-47 tags, used for both speech synthesis and Intl date formatting
const LOCALES: Record<Lang, string> = {
  fr: 'fr-FR',
  sv: 'sv-SE',
  en: 'en-GB',
  nl: 'nl-NL',
  es: 'es-ES',
  de: 'de-DE',
}

export function localeOf(lang: Lang): string {
  return LOCALES[lang]
}

// Emoji flags, for the few places that can only take a plain string (Segmented
// options). Chrome-level UI uses the SVG flags in components/ui/flags.tsx.
const FLAGS: Record<Lang, string> = {
  fr: '🇫🇷',
  sv: '🇸🇪',
  en: '🇬🇧',
  nl: '🇳🇱',
  es: '🇪🇸',
  de: '🇩🇪',
}

export function flagOf(lang: Lang): string {
  return FLAGS[lang]
}

// Verb forms drilled by the conjugation exercise, in display order.
// Only languages that appear as a pair's `term` need an entry.
const VERB_FORMS: Partial<Record<Lang, readonly string[]>> = {
  sv: ['present', 'preterit', 'supine'],
  en: ['past', 'pastParticiple'],
  nl: ['past', 'pastParticiple'],
  es: ['past', 'pastParticiple'],
  de: ['past', 'pastParticiple'],
}

export function verbFormsFor(lang: Lang): readonly string[] {
  return VERB_FORMS[lang] ?? []
}
