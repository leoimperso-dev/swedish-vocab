// When several words of a pair share a surface key ("vad" the interrogative
// and "en vad" the calf), corpus-driven data keyed on that surface — frequency
// ranks, Tatoeba example sentences — must go to ONE of them, or the rare
// homograph inherits sentences and a rank that belong to the frequent one.
//
// Heuristics, in order:
//   1. On a hot token (corpus rank <= HOT_RANK), nouns lose to any other part
//      of speech: top-of-corpus tokens are function words and verb forms almost
//      by definition ("vad", "får", "was", "bij").
//   2. A word whose headword IS the key beats one that only reaches it through
//      an inflected form.
//   3. Deterministic tie-break by part-of-speech priority, then id.
// Losers simply drop the key: no rank, no examples from it. Better nothing
// than wrong — the rest of their keys (other forms) still work.

const HOT_RANK = 500

const TYPE_PRIORITY: Record<string, number> = {
  FUNCTION: 0, OTHER: 1, ADVERB: 2, VERB: 3, ADJECTIVE: 4,
  PHRASE: 5, NOUN: 6, NOUN_EN: 6, NOUN_ETT: 6,
}

export interface KeyClaimant {
  id: string
  wordType: string
  headKey: string // normalized headword
  keys: string[] // every surface key this word would claim (headword + forms)
}

export function resolveKeyOwnership(
  claimants: KeyClaimant[],
  tokenRank: (key: string) => number | undefined,
): Map<string, Set<string>> {
  const byKey = new Map<string, KeyClaimant[]>()
  for (const c of claimants) {
    for (const k of new Set(c.keys)) {
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k)!.push(c)
    }
  }

  const allowed = new Map<string, Set<string>>(claimants.map(c => [c.id, new Set<string>()]))
  for (const [key, pool] of byKey) {
    if (pool.length === 1) {
      allowed.get(pool[0].id)!.add(key)
      continue
    }
    let candidates = pool
    const rank = tokenRank(key)
    if (rank !== undefined && rank <= HOT_RANK) {
      const nonNouns = candidates.filter(c => !c.wordType.startsWith('NOUN'))
      if (nonNouns.length > 0) candidates = nonNouns
    }
    const headwordOwners = candidates.filter(c => c.headKey === key)
    if (headwordOwners.length > 0) candidates = headwordOwners
    candidates = [...candidates].sort(
      (a, b) => (TYPE_PRIORITY[a.wordType] ?? 9) - (TYPE_PRIORITY[b.wordType] ?? 9) || a.id.localeCompare(b.id),
    )
    allowed.get(candidates[0].id)!.add(key)
  }
  return allowed
}
