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

// Punctuation a learner may legitimately omit, mistype or add: none of it is
// vocabulary. A missing full stop or a straight quote where the source has a
// curly one used to cost the answer, which made a dictated sentence nearly
// impossible to get right.
const PUNCTUATION = /[.,!?¡¿;:"«»…„“”'’`()[\]{}\-–—]/g

// Case and spacing only. Punctuation survives this step because the sense
// separators and usage notes below are punctuation: "crier, aboyer" has to be
// split before its comma can be dropped.
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// What is actually compared: no punctuation at all
function bare(s: string): string {
  return s.replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim()
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
  // Elided article: normalize() has already turned "l'ami" into "l ami"
  'l',
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
    // Punctuation comes off here, once the variant has been carved out
    const trimmed = bare(v)
    if (!trimmed) return
    out.add(trimmed)
    const withoutMarker = stripMarker(trimmed)
    if (withoutMarker) out.add(withoutMarker)
  }
  const base = normalize(s)
  add(base)
  add(stripFormatting(base))
  const clean = dropNotes(base)
  add(clean)
  if (clean.length > 0) for (const sense of clean.split(/[,;/]/)) add(sense)
  return [...out]
}

/** Below this, the expected answer is a headword with its article, not a sentence. */
const SENTENCE_MIN_TOKENS = 4

function tokenize(s: string): string[] {
  return s.replace(PUNCTUATION, ' ').split(/\s+/).filter(Boolean)
}

/**
 * Which words are not graded: the capitalised ones, wherever they sit.
 *
 * A name cannot be spelled from hearing it, so it is never required — and many
 * sentences open on one ("Tom est allé..."), which is why the first word is
 * included even though it is capitalised by grammar rather than by being a
 * name. The cost is that the opening word of every sentence goes ungraded; it
 * is nearly always an article or a pronoun, and marking a whole dictation
 * wrong over a name the learner could not possibly spell is worse.
 */
function freeTokens(expectedRaw: string): boolean[] {
  return tokenize(expectedRaw).map(
    token => token[0] === token[0].toLocaleUpperCase() && token[0] !== token[0].toLocaleLowerCase(),
  )
}

/** Same word, allowing a slip that grows with its length. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const tolerance = b.length <= 3 ? 0 : b.length <= 6 ? 1 : 2
  return levenshtein(a, b) <= tolerance
}

/**
 * Word-level edit distance, where a proper name costs nothing however it was
 * typed — or left out.
 */
function sentenceErrors(given: string[], expected: string[], free: boolean[]): number {
  const m = given.length
  const n = expected.length
  // dp[i][j] = errors turning the first i given words into the first j expected ones
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let j = 1; j <= n; j++) dp[0][j] = dp[0][j - 1] + (free[j - 1] ? 0 : 1)
  for (let i = 1; i <= m; i++) dp[i][0] = i
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const substitution = free[j - 1] || sameWord(given[i - 1], expected[j - 1]) ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + substitution,
        dp[i - 1][j] + 1, // a word the learner added
        dp[i][j - 1] + (free[j - 1] ? 0 : 1), // a word they left out
      )
    }
  }
  return dp[m][n]
}

/**
 * A dictated sentence is graded word by word, not character by character.
 *
 * Two things a whole-string Levenshtein gets wrong on a sentence. One wrong
 * word in the middle blows the character budget and reads as a failed answer
 * even though the learner heard everything else — and proper names ("Tom",
 * "Anna", "Göteborg") are not vocabulary at all. Only what the sentence
 * teaches is graded.
 */
function evaluateSentence(input: string, expectedRaw: string): AnswerResult {
  const expected = tokenize(bare(normalize(expectedRaw)))
  const given = tokenize(bare(normalize(input)))
  const errors = sentenceErrors(given, expected, freeTokens(expectedRaw))
  if (errors === 0) return 'correct'
  // One slip in a long sentence is a slip, not a misunderstanding
  return errors <= (expected.length >= 8 ? 2 : 1) ? 'approximate' : 'incorrect'
}

export function evaluateAnswer(input: string, expected: string): AnswerResult {
  const given = variants(input)
  const accepted = variants(expected)
  if (given.some(v => accepted.includes(v))) return 'correct'

  // Long enough to be a sentence (a dictation), not a headword with its article
  if (tokenize(bare(normalize(expected))).length >= SENTENCE_MIN_TOKENS) {
    return evaluateSentence(input, expected)
  }

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
  // Scale tolerance with word length — a long compound has more places to slip
  const maxDist = bestLength <= 4 ? 1 : bestLength <= 8 ? 2 : 3
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
