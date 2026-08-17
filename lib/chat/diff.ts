// Word-level difference between what the learner wrote and the corrected
// sentence.
//
// The model is asked for the whole sentence rewritten, which reads well but
// buries the mistake: "Jag gick till skolan igår och jag åt ett äpple" gives no
// clue that only two words moved. Computing the difference here rather than
// asking the model to mark it costs nothing and cannot be got wrong — both
// strings are already known.

export type DiffKind = 'same' | 'added' | 'removed'
export interface DiffPart {
  text: string
  kind: DiffKind
}

// Compared without case or punctuation so "Igår" and "igår," count as the same
// word, while the displayed text keeps the original spelling
function key(word: string): string {
  return word.toLowerCase().replace(/[.,!?;:«»"'()¿¡]/g, '')
}

/**
 * The classic longest-common-subsequence diff, over words. Sentences here are
 * a dozen words at most, so the quadratic table costs nothing.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.trim().split(/\s+/).filter(Boolean)
  const b = after.trim().split(/\s+/).filter(Boolean)
  if (a.length === 0) return b.map(text => ({ text, kind: 'added' as const }))

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = key(a[i]) === key(b[j])
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      parts.push({ text: b[j], kind: 'same' })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      parts.push({ text: a[i], kind: 'removed' })
      i++
    } else {
      parts.push({ text: b[j], kind: 'added' })
      j++
    }
  }
  while (i < a.length) parts.push({ text: a[i++], kind: 'removed' })
  while (j < b.length) parts.push({ text: b[j++], kind: 'added' })
  return parts
}

/** True when the correction is only a rephrasing — nothing worth highlighting. */
export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some(p => p.kind !== 'same')
}
