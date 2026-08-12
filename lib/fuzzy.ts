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
// infinitive particle ("to do", "att göra", "te doen") and the noun article
// ("en flicka", "het huis", "la casa"). Both spellings are right.
const LEADING_MARKER = /^(to|att|te|en|ett|de|het|el|la|los|las|un|una|le|les)\s+/

function stripMarker(s: string): string {
  return s.replace(LEADING_MARKER, '')
}

export function evaluateAnswer(input: string, expected: string): AnswerResult {
  const a = normalize(input)
  const b = normalize(expected)
  if (a === b) return 'correct'

  // Also try without formatting chars
  const aStripped = stripFormatting(a)
  const bStripped = stripFormatting(b)
  if (aStripped === bStripped) return 'correct'

  // "do" for "to do", "flicka" for "en flicka" — and the reverse
  if (stripMarker(aStripped) === stripMarker(bStripped)) return 'correct'

  const dist = levenshtein(aStripped, bStripped)
  // Scale tolerance with word length
  const maxDist = bStripped.length <= 4 ? 1 : 2
  if (dist <= maxDist) return 'approximate'

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
