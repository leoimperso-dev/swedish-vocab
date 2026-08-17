// Guards the two rules the conversation partner depends on.
//
// The prompt has to name the language it must answer in and the level it must
// answer at, and the correction line has to be separable from a stream that
// arrives one fragment at a time — including a fragment that cuts the marker
// in half. Both fail silently in production, so they are checked here.
//
// Usage: pnpm tsx scripts/check-chat-prompt.ts
import { CORRECTION_MARKER, buildSystemPrompt, splitCorrection } from '../lib/chat/prompt'
import { diffWords, hasChanges } from '../lib/chat/diff'

let failures = 0
function check(label: string, condition: boolean) {
  if (!condition) {
    failures++
    console.error(`ÉCHEC  ${label}`)
  }
}

// ── The prompt carries what the model needs ──
const swedishA1 = buildSystemPrompt('sv', 'fr', 'A1', null)
check('prompt: nomme la langue apprise', swedishA1.includes('Swedish'))
check('prompt: nomme la langue native', swedishA1.includes('French'))
check('prompt: nomme le niveau', swedishA1.includes('A1'))
check('prompt: contraint la longueur des phrases pour A1', swedishA1.includes('6 words'))
check('prompt: décrit le marqueur de correction', swedishA1.includes(CORRECTION_MARKER))
check('prompt: sans sujet, le dit', swedishA1.includes('No topic'))

const spanishC1 = buildSystemPrompt('es', 'en', 'C1', 'El teletrabajo')
check('prompt: reprend le sujet choisi', spanishC1.includes('El teletrabajo'))
check('prompt: adapte la consigne au niveau C1', spanishC1.includes('native speaker') === false)
check('prompt: niveau inconnu retombe sur A2', buildSystemPrompt('nl', 'fr', null, null).includes('A2'))

// ── The split survives a stream ──
const plain = splitCorrection('Hej! Hur mår du?')
check('split: sans marqueur, tout est réponse', plain.reply === 'Hej! Hur mår du?' && !plain.correction)

const full = splitCorrection(`Hej då!\n\n${CORRECTION_MARKER} Jag heter Anna — accord du verbe`)
check('split: réponse isolée', full.reply === 'Hej då!')
check('split: correction isolée', full.correction === 'Jag heter Anna — accord du verbe')

// A chunk boundary can fall anywhere inside the marker
for (let cut = 1; cut < CORRECTION_MARKER.length; cut++) {
  const partial = `Bra jobbat!\n\n${CORRECTION_MARKER.slice(0, cut)}`
  const result = splitCorrection(partial)
  check(
    `split: marqueur coupé après ${cut} caractère(s) n'apparaît pas dans la réponse`,
    !result.reply.includes(CORRECTION_MARKER.slice(0, cut)) && result.pending.length > 0,
  )
}

// A lone bracket that is not the marker must not be held forever
const unrelated = splitCorrection('Kostar 5 ⟦x⟧ kronor')
check('split: un crochet sans rapport passe', unrelated.reply === 'Kostar 5 ⟦x⟧ kronor')

// Reassembling the pieces must lose nothing
const streamed = `Vi ses!\n\n${CORRECTION_MARKER} Vi ses imorgon — futur`
let seen = ''
let reply = ''
let correction = ''
for (const char of streamed) {
  seen += char
  const step = splitCorrection(seen)
  reply = step.reply
  correction = step.correction
}
check('split: à la fin du flux, rien ne manque', reply === 'Vi ses!' && correction === 'Vi ses imorgon — futur')

// ── The diff points at the mistake instead of burying it ──
const swapped = diffWords(
  'Jag har gick till skolan igår och jag äta en äpple.',
  'Jag gick till skolan igår och jag åt ett äpple',
)
const added = swapped.filter(p => p.kind === 'added').map(p => p.text)
const removed = swapped.filter(p => p.kind === 'removed').map(p => p.text)
check('diff: repère le mot ajouté', added.includes('åt') && added.includes('ett'))
check('diff: repère le mot retiré', removed.includes('har') && removed.includes('äta'))
check('diff: ne touche pas au reste', swapped.filter(p => p.kind === 'same').length >= 6)

const moved = diffWords('Igår jag gick till affären.', 'Igår gick jag till affären')
check('diff: voit une inversion de mots', hasChanges(moved))

const identical = diffWords('Jag heter Anna.', 'Jag heter Anna')
check('diff: ponctuation seule ne compte pas comme une faute', !hasChanges(identical))

const caseOnly = diffWords('igår gick jag hem', 'Igår gick jag hem')
check('diff: la casse seule ne compte pas', !hasChanges(caseOnly))

const fromEmpty = diffWords('', 'Jag heter Anna')
check('diff: phrase de départ vide', fromEmpty.every(p => p.kind === 'added'))

console.log(failures === 0 ? 'prompt, découpage et diff OK' : `${failures} échec(s)`)
process.exit(failures === 0 ? 0 : 1)
