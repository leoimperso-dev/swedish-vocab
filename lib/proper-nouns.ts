// Names in a text read as common words in the dictionary ("Ana" → "ano"): the
// reader flags them so the lookup only accepts a capitalised headword.

export function cleanToken(raw: string): string {
  return raw.toLowerCase().replace(/[.,!?¿¡;:"«»()[\]…'’„“”–—]/g, '').trim()
}

/**
 * Words capitalised where a sentence does not start: not first, not after
 * end punctuation or a dialogue colon, not opening a quote. "I" and "I'd" are
 * capitalised everywhere and are not names.
 */
export function midSentenceCapitals(text: string): Set<string> {
  const names = new Set<string>()
  const words = text.split(/\s+/).filter(Boolean)
  words.forEach((word, i) => {
    // A dash or a quote opens a line of dialogue; Dutch "'s Ochtends" opens a sentence
    if (i === 0 || /[.!?…:]["'»”’]?$/.test(words[i - 1]) || /^([—–\-"«„“]+|['’][st])$/i.test(words[i - 1])) return
    if (/^["'«„“¡¿(]/.test(word)) return
    if (!/^\p{Lu}/u.test(word) || /['’]/.test(word)) return
    const token = cleanToken(word)
    if (token.length > 1) names.add(token)
  })
  return names
}

/** Story-wide names: capitalised mid-sentence somewhere, never written in lowercase. */
export function storyProperNouns(body: string): Set<string> {
  const lowercase = new Set(body.split(/\s+/).filter(w => /^\p{Ll}/u.test(w.replace(/^["'«„“(¿¡—–-]+/, ''))).map(cleanToken))
  // Line by line: a dialogue turn or a paragraph starts a sentence of its own
  const names = body.split(/\n+/).flatMap(line => [...midSentenceCapitals(line)])
  return new Set(names.filter(name => !lowercase.has(name)))
}
