// Deciding whether a cloze card is answerable at all.
//
// A cloze shows a sentence with one word hidden, its full translation, and the
// hidden word's dictionary gloss as a hint. That only works when the gloss
// describes the sense the sentence uses. Frequency ranks are computed per
// written form while glosses describe one sense, so the two can disagree:
// "id" is ranked on "student ID" but glossed "ça" (the Freudian id), which
// leaves the learner nothing to work from.
//
// The check: at least one sense of the gloss has to surface in the translated
// sentence. If none does, the card is unanswerable and the word is not offered
// for cloze — it stays available to every other exercise.

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Apostrophes are separators: French elision makes "l'acide" two words
const tokenize = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean)

// Function words carry no meaning to match on
const STOP = new Set([
  'le', 'la', 'les', 'un', 'une', 'du', 'des', 'de', 'd', 'a', 'au', 'aux', 'l',
  'se', 's', 'en', 'y', 'ne', 'pas', 'etre', 'avoir', 'qui', 'que',
])

/** Each comma-separated sense of a gloss, reduced to its first content word. */
export function glossSenses(gloss: string): string[] {
  return gloss
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;/]/)
    .map(part => tokenize(part).find(token => !STOP.has(token)))
    .filter((token): token is string => !!token && token.length >= 2)
}

/**
 * A sense counts as present when a word of the sentence starts with its first
 * four letters — enough to absorb French inflection ("courir" / "il court")
 * without matching unrelated words. Senses too short for a stem to mean
 * anything have to appear whole, or "ça" would match "carte".
 */
function sensePresent(sense: string, sentence: string): boolean {
  const words = tokenize(sentence)
  if (sense.length <= 3) return words.includes(sense)
  const stem = sense.slice(0, 4)
  return words.some(word => word.startsWith(stem))
}

/** The examples whose translation actually points at the hidden word. */
export function answerableExamples<T extends { translation?: string }>(
  examples: T[],
  gloss: string,
): T[] {
  const senses = glossSenses(gloss)
  if (senses.length === 0) return []
  return examples.filter(e => e.translation && senses.some(s => sensePresent(s, e.translation!)))
}
