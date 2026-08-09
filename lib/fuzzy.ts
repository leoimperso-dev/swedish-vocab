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

export function evaluateAnswer(input: string, expected: string): AnswerResult {
  const a = normalize(input)
  const b = normalize(expected)
  if (a === b) return 'correct'

  // Also try without formatting chars
  const aStripped = stripFormatting(a)
  const bStripped = stripFormatting(b)
  if (aStripped === bStripped) return 'correct'

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
