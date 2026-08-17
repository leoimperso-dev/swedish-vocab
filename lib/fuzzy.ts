export type AnswerResult = 'correct' | 'approximate' | 'incorrect'

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Normalize: trim, lowercase, collapse spaces
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Strip formatting chars that shouldn't count as typos
function stripFormatting(s: string): string {
  return s.replace(/[()[\]{}]/g, '').replace(/\s+/g, ' ').trim()
}

// Headwords carry a leading marker the learner may or may not type: the
// infinitive particle ("to do", "att göra", "te doen") and the article
// ("en flicka", "the cat", "un monstre"). Entries are inconsistent about it
// across languages — "un monstre" is stored with its article, "monster"
// without — so both spellings have to be right in both directions.
const MARKERS = [
  'to', 'att', 'te',
  'a', 'an', 'the',
  'en', 'ett',
  'de', 'het',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'le', 'les', 'une', 'des', 'du',
]
const LEADING_MARKER = new RegExp(`^(?:${MARKERS.join('|')})\\s+|^l['’]`)

// Twice, so partitives made of two markers come off whole ("de la confiture")
function stripMarker(s: string): string {
  return s.replace(LEADING_MARKER, '').replace(LEADING_MARKER, '').trim()
}

// Usage notes are read, not answered: "une école (primaire)" is answered "une école"
function dropNotes(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Every spelling that should count as this answer: with and without its
 * article, with and without its usage note, and each sense on its own — an
 * entry glossed "crier, aboyer" is answered by either verb.
 */
function variants(s: string): string[] {
  const out = new Set<string>()
  const add = (v: string) => {
    const trimmed = v.trim()
    if (!trimmed) return
    out.add(trimmed)
    const bare = stripMarker(trimmed)
    if (bare) out.add(bare)
  }
  const base = normalize(s)
  add(base)
  add(stripFormatting(base))
  const clean = dropNotes(base)
  add(clean)
  if (clean.length > 0) for (const sense of clean.split(/[,;/]/)) add(sense)
  return [...out]
}

export function evaluateAnswer(input: string, expected: string): AnswerResult {
  const given = variants(input)
  const accepted = variants(expected)
  if (given.some(v => accepted.includes(v))) return 'correct'

  // Typo tolerance, measured against the closest acceptable spelling so that a
  // missing article never eats the allowance
  let best = Infinity
  let bestLength = 0
  for (const a of given) {
    for (const b of accepted) {
      const dist = levenshtein(a, b)
      if (dist < best) {
        best = dist
        bestLength = b.length
      }
    }
  }
  // Scale tolerance with word length
  const maxDist = bestLength <= 4 ? 1 : 2
  if (best <= maxDist) return 'approximate'

  return 'incorrect'
}

export interface VerbForms {
  present: string
  preterit: string
  supine: string
}

export type VerbEvaluation = Record<string, AnswerResult>

// `keys` are the forms drilled for the language at hand (see verbFormsFor in lib/courses.ts)
export function evaluateVerbForms(
  inputs: Record<string, string | undefined>,
  forms: Record<string, string | undefined>,
  keys: readonly string[]
): VerbEvaluation {
  const evaluation: VerbEvaluation = {}
  for (const key of keys) {
    // A missing expected form counts as correct (the field isn't part of the exercise)
    evaluation[key] = !forms[key]
      ? 'correct'
      : inputs[key]
      ? evaluateAnswer(inputs[key]!, forms[key]!)
      : 'incorrect'
  }
  return evaluation
}

// Parse verb forms from string like "går, gick, gått" or "(går, gick, gått)"
export function parseVerbForms(formsString: string): VerbForms | null {
  const cleaned = formsString.replace(/[()]/g, '').trim()
  const parts = cleaned.split(',').map(s => s.trim())
  if (parts.length < 3) return null
  return { present: parts[0], preterit: parts[1], supine: parts[2] }
}

/**
 * Compares a spoken answer to the expected sentence. Speech engines return no
 * punctuation, inconsistent casing and sometimes digits, so the comparison
 * strips everything that speaking cannot convey and tolerates more than typing
 * does — a wrong transcription must not read as a wrong answer.
 */
export function evaluateSpokenAnswer(spoken: string, expected: string): AnswerResult {
  const clean = (s: string) =>
    s.toLowerCase()
      .replace(/[.,!?¿¡;:"«»()[\]…'’„“”\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const a = clean(spoken)
  const b = clean(expected)
  if (!a) return 'incorrect'
  if (a === b) return 'correct'

  const dist = levenshtein(a, b)
  // Roughly one wrong character per five, floor of two: speech-to-text slips on
  // endings and compound boundaries far more often than a typist does
  const tolerance = Math.max(2, Math.round(b.length / 5))
  if (dist <= tolerance) return 'correct'
  if (dist <= tolerance * 2) return 'approximate'
  return 'incorrect'
}

const RESULT_RANK: Record<AnswerResult, number> = { incorrect: 0, approximate: 1, correct: 2 }

/**
 * Grades against every acceptable answer and keeps the best verdict. Producing
 * a word from its translation has more than one right answer: shown "crier,
 * aboyer", "bark" is at least as good as the stored "bay".
 */
export function evaluateAlternatives(input: string, accepted: string[]): AnswerResult {
  let best: AnswerResult = 'incorrect'
  for (const candidate of accepted) {
    const result = evaluateAnswer(input, candidate)
    if (RESULT_RANK[result] > RESULT_RANK[best]) best = result
    if (best === 'correct') break
  }
  return best
}

/**
 * Grades a spoken answer against every accepted phrasing of a dialogue turn and
 * keeps the most favourable verdict. One idea has many correct wordings, and
 * refusing all but the authored one teaches the wording, not the language.
 */
export function evaluateSpokenAlternatives(spoken: string, accepted: string[]): AnswerResult {
  let best: AnswerResult = 'incorrect'
  for (const candidate of accepted) {
    const result = evaluateSpokenAnswer(spoken, candidate)
    if (RESULT_RANK[result] > RESULT_RANK[best]) best = result
    if (best === 'correct') break
  }
  return best
}
