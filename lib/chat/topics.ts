// Conversation openers.
//
// Written in the interface language, not the language being learned: an A1
// learner has to be able to read the choice before they can talk about it.
//
// The model generates three fresh ones per session; this pool is what the
// screen shows when it cannot — a saturated provider must not block the door.
import type { CefrLevel } from '@/lib/cefr'
import type { Lang } from '@/lib/courses'

type Band = 'easy' | 'medium' | 'hard'

export function bandOf(level: CefrLevel | null): Band {
  if (level === 'C1' || level === 'C2') return 'hard'
  if (level === 'B1' || level === 'B2') return 'medium'
  return 'easy'
}

const POOL: Record<'fr' | 'sv' | 'en', Record<Band, string[]>> = {
  fr: {
    easy: [
      'Ta journée d\'hier',
      'Ton petit-déjeuner préféré',
      'Le temps qu\'il fait aujourd\'hui',
      'Ta famille',
      'Ce que tu fais le week-end',
      'Ton animal préféré',
    ],
    medium: [
      'Un voyage qui t\'a marqué',
      'Le dernier film que tu as vu',
      'Ce que tu changerais dans ta ville',
      'Un plat que tu sais cuisiner',
      'Ton travail ou tes études',
      'Une habitude que tu aimerais prendre',
    ],
    hard: [
      'Le télétravail a-t-il amélioré nos vies ?',
      'Faut-il limiter les réseaux sociaux aux mineurs ?',
      'Un livre qui a changé ta façon de penser',
      'La place de la voiture en ville',
      'Ce que l\'intelligence artificielle va changer à ton métier',
      'Vaut-il mieux se spécialiser ou être polyvalent ?',
    ],
  },
  sv: {
    easy: [
      'Din gårdag',
      'Din favoritfrukost',
      'Vädret i dag',
      'Din familj',
      'Vad du gör på helgen',
      'Ditt favoritdjur',
    ],
    medium: [
      'En resa du minns',
      'Den senaste filmen du såg',
      'Vad du skulle ändra i din stad',
      'En rätt du kan laga',
      'Ditt jobb eller dina studier',
      'En vana du vill skaffa dig',
    ],
    hard: [
      'Har distansarbetet gjort livet bättre?',
      'Bör sociala medier begränsas för unga?',
      'En bok som ändrade hur du tänker',
      'Bilens plats i staden',
      'Vad AI kommer att ändra i ditt yrke',
      'Är det bättre att specialisera sig eller vara bred?',
    ],
  },
  en: {
    easy: [
      'Your day yesterday',
      'Your favourite breakfast',
      'The weather today',
      'Your family',
      'What you do at the weekend',
      'Your favourite animal',
    ],
    medium: [
      'A trip you remember',
      'The last film you watched',
      'What you would change in your town',
      'A dish you can cook',
      'Your work or your studies',
      'A habit you would like to pick up',
    ],
    hard: [
      'Has remote work made life better?',
      'Should social media be limited for teenagers?',
      'A book that changed how you think',
      'The place of cars in cities',
      'What AI will change about your job',
      'Is it better to specialise or to stay broad?',
    ],
  },
}

/** Three openers from the pool, varied per call. */
export function fallbackTopics(native: Lang, level: CefrLevel | null): string[] {
  const pool = POOL[native as 'fr' | 'sv' | 'en'] ?? POOL.fr
  const list = [...pool[bandOf(level)]]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list.slice(0, 3)
}

/**
 * Asks the model for three openers. Cheap and history-free (~150 tokens), and
 * seeded — without a seed every learner is offered the same three every day.
 */
export function topicsPrompt(nativeName: string, level: CefrLevel | null, seed: string): string {
  const difficulty = {
    easy: 'very simple, everyday, about the learner themselves',
    medium: 'everyday but open-ended, inviting a story or an opinion',
    hard: 'debatable, abstract, worth arguing about',
  }[bandOf(level)]
  return [
    `Suggest exactly 3 conversation openers for a language learner, written in ${nativeName}.`,
    `They must be ${difficulty}.`,
    `Each one at most 8 words, no numbering, no quotes, one per line, nothing else.`,
    `Vary them; seed: ${seed}.`,
  ].join('\n')
}

/** Reads back the model's three lines, defensively. */
export function parseTopics(raw: string): string[] {
  return raw
    .split('\n')
    .map(line => line.replace(/^\s*[-*\d.)\]]+\s*/, '').replace(/^["'«]|["'»]$/g, '').trim())
    .filter(line => line.length >= 3 && line.length <= 80)
    .slice(0, 3)
}
