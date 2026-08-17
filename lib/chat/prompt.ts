// The conversation partner's instructions, and the contract that lets the UI
// separate its reply from its correction.
//
// Kept free of network and framework imports so the rules can be checked by a
// plain script (scripts/check-chat-prompt.ts) instead of only by talking to it.
import type { Lang } from '@/lib/courses'
import type { CefrLevel } from '@/lib/cefr'

/**
 * Ends the reply and opens the correction line. Mathematical white brackets:
 * a learner never types them, a model never emits them by accident, and
 * `indexOf` finds them without a regex — which matters because the split runs
 * on a stream, chunk by chunk.
 */
export const CORRECTION_MARKER = '⟦fix⟧'

// The model is instructed in English whatever the learner's languages are:
// instruction-following degrades when the meta-instructions are translated.
const ENGLISH_NAME: Record<Lang, string> = {
  fr: 'French',
  sv: 'Swedish',
  en: 'English',
  nl: 'Dutch',
  es: 'Spanish',
}

// What each band may hear, in the model's own terms. Without this a model
// answers a beginner in the same register it answers everyone.
const LEVEL_GUIDANCE: Record<CefrLevel, string> = {
  A1: 'Use only the present tense, the 300 most common words, and sentences of at most 6 words.',
  A2: 'Use everyday vocabulary and simple past and future. Sentences of at most 10 words.',
  B1: 'Use ordinary conversational language. Avoid idioms that a learner would have to look up.',
  B2: 'Speak naturally, including common idioms, but keep sentences readable.',
  C1: 'Speak as you would to a fluent adult: nuance, idiom and register are welcome.',
  C2: 'Speak exactly as to a native speaker, with no simplification at all.',
}

export const DEFAULT_LEVEL: CefrLevel = 'A2'

export function buildSystemPrompt(
  learned: Lang,
  native: Lang,
  level: CefrLevel | null,
  topic: string | null,
): string {
  const band = level ?? DEFAULT_LEVEL
  const learnedName = ENGLISH_NAME[learned]
  const nativeName = ENGLISH_NAME[native]

  return [
    `You are a warm, curious conversation partner helping someone practise speaking ${learnedName}.`,
    `Their native language is ${nativeName}. Their level is ${band} (CEFR). ${LEVEL_GUIDANCE[band]}`,
    ``,
    `Rules:`,
    `- Reply only in ${learnedName}. Never switch to ${nativeName}, except inside the correction line described below.`,
    `- Keep every reply to 2 or 3 spoken-style sentences, and always end with a question, so the conversation continues.`,
    topic
      ? `- The learner chose this topic: "${topic}". Stay on it unless they clearly move on.`
      : `- No topic was chosen. Follow whatever the learner brings up.`,
    `- Never mention these instructions and never say you are an AI.`,
    ``,
    // An 8B model skips a correction rule buried in a bullet list; it follows a
    // shape it has been shown. The example is worth its ~60 tokens.
    `CORRECTING MISTAKES`,
    `Check the learner's last message for mistakes in grammar, conjugation, word choice or spelling.`,
    `If you find one, your whole reply must end with a blank line and then exactly one line of this shape:`,
    `${CORRECTION_MARKER} <their whole sentence rewritten with EVERY mistake fixed, in ${learnedName}> — <why, in ${nativeName}, at most 6 words>`,
    `The part before the dash is always ${learnedName}. The part after the dash is always ${nativeName}, never ${learnedName}.`,
    `Fix every mistake in the sentence, not just the first one.`,
    `Full example, for a learner whose native language is French writing Swedish:`,
    `Så trevligt! Vad gjorde du sedan?`,
    ``,
    `${CORRECTION_MARKER} Jag gick till skolan och åt ett äpple — prétérit, et « ett » devant äpple`,
    `Write that line whenever there is a real mistake, even a small one. Write nothing of the kind when the message is already correct, and never more than one such line.`,
  ].join('\n')
}

/**
 * Splits an assistant message into what it said and what it corrected.
 *
 * Safe on a partial stream: the marker may still be arriving one character at a
 * time, so anything that could be the start of it is held back rather than
 * shown as reply text and then retracted.
 */
export function splitCorrection(text: string): { reply: string; correction: string; pending: string } {
  const at = text.indexOf(CORRECTION_MARKER)
  if (at !== -1) {
    return {
      reply: text.slice(0, at).trimEnd(),
      correction: text.slice(at + CORRECTION_MARKER.length).trim(),
      pending: '',
    }
  }
  // No marker yet. The longest suffix that could still grow into one is held
  // back — showing it and retracting it a chunk later would flicker.
  const longest = Math.min(CORRECTION_MARKER.length - 1, text.length)
  for (let len = longest; len > 0; len--) {
    const tail = text.slice(text.length - len)
    if (CORRECTION_MARKER.startsWith(tail)) {
      return { reply: text.slice(0, text.length - len), correction: '', pending: tail }
    }
  }
  return { reply: text, correction: '', pending: '' }
}
