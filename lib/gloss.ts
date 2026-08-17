// Reading a dictionary gloss as a set of senses.
//
// An entry lists several senses separated by commas, sometimes with a usage
// note in parentheses: "frapper, battre", "un courant (électrique)". Comparing
// glosses as whole strings misses that two words can share one sense — which is
// exactly what makes a learner's answer right when it is not the stored one.

// NFD splits accents off their letter, but leaves the ligatures whole: without
// this, "cœur" tokenizes to "c" + "ur" and never matches "coeur"
const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae')

// Apostrophes are separators: French elision makes "l'acide" two words
export const tokenize = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean)

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
 * True when two glosses name at least one sense in common — the test for
 * "these two words are interchangeable here". Deliberately generous: refusing a
 * correct answer costs the learner more than accepting a near-synonym.
 */
export function glossesOverlap(a: string, b: string): boolean {
  const senses = new Set(glossSenses(a))
  return glossSenses(b).some(sense => senses.has(sense))
}
