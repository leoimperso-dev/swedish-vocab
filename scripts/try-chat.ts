// Sends one real turn to Groq, to check the key, the model chain and the
// correction line without opening a browser. Costs a few hundred tokens.
//
// Usage: pnpm tsx scripts/try-chat.ts [sv|en|nl|es] ["message fautif"]
import 'dotenv/config'
import { buildSystemPrompt, splitCorrection } from '../lib/chat/prompt'
import { runChatCompletion } from '../lib/chat/stream'
import type { Lang } from '../lib/courses'

async function main() {
  const learned = (process.argv[2] as Lang) || 'sv'
  const message = process.argv[3] || 'Jag har gick till skolan igår.'

  const system = buildSystemPrompt(learned, 'fr', 'A2', 'Ta journée d\'hier')
  console.log(`— prompt système (${system.length} caractères, ~${Math.round(system.length / 4)} tokens)\n`)

  const { body, model } = await runChatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: message },
  ])
  console.log(`— modèle retenu : ${model}`)
  console.log(`— message envoyé : ${message}\n`)

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }

  const { reply, correction } = splitCorrection(raw)
  console.log('— réponse :\n' + reply)
  console.log('\n— correction :\n' + (correction || '(aucune)'))
  process.exit(0)
}
main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
