// Checks what replaying an offline session must guarantee, against the real
// database and a throwaway account.
//
// Two things can only fail silently. An answer given yesterday and synced today
// would be scheduled from today, quietly pushing every interval by the length
// of the disconnection. And a batch resent after a timeout would be counted
// twice, paying its XP twice — the phone keeps its queue until the server
// confirms, so a retry is normal, not exceptional.
//
// Usage: pnpm tsx scripts/check-offline-sync.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { recordAnswer } from '../lib/study/answer'
import { knowledgeLevel } from '../lib/sm2'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const DAY = 24 * 60 * 60 * 1000

async function main() {
  const word = await db.word.findFirst({ where: { pair: 'sv-fr', studyable: true }, select: { id: true } })
  if (!word) { console.error('vocabulaire vide'); process.exit(1) }

  const user = await db.user.create({
    data: {
      email: `check-offline-${Date.now()}@example.invalid`,
      name: 'Check Offline', nativeLanguage: 'fr', learningLanguage: 'sv',
    },
  })

  try {
    const session = await db.studySession.create({ data: { userId: user.id } })
    const answeredAt = new Date(Date.now() - 2 * DAY)

    await recordAnswer(user.id, {
      wordId: word.id, result: 'correct', direction: 'FR_SV',
      sessionId: session.id, answeredAt,
    })
    const row = (await db.userWord.findFirst({ where: { userId: user.id } }))!

    // A first correct answer schedules one day out — from when it was answered
    const expected = new Date(answeredAt)
    expected.setDate(expected.getDate() + 1)
    check(
      'la révision est programmée depuis le moment de la réponse',
      Math.abs(row.nextReview.getTime() - expected.getTime()) < 60_000,
      `${row.nextReview.toISOString()} vs ${expected.toISOString()}`,
    )
    check(
      'le mot est donc déjà dû, pas repoussé de deux jours',
      row.nextReview.getTime() < Date.now(),
    )
    check('lastStudied porte la même date', Math.abs(row.lastStudied!.getTime() - answeredAt.getTime()) < 60_000)
    check('la progression avance normalement', knowledgeLevel(row.interval) >= 1)

    // The unique index is what makes a resent batch a no-op
    const batch = `batch-${Date.now()}`
    await db.studySession.update({ where: { id: session.id }, data: { offlineBatch: batch } })
    let rejected = false
    try {
      await db.studySession.create({ data: { userId: user.id, offlineBatch: batch } })
    } catch {
      rejected = true
    }
    check('un même lot ne peut pas être enregistré deux fois', rejected)

    // ...and the route looks the batch up before writing anything
    const found = await db.studySession.findFirst({
      where: { userId: user.id, offlineBatch: batch },
      select: { id: true },
    })
    check('le lot déjà synchronisé est retrouvable', found !== null)
  } finally {
    await db.userWord.deleteMany({ where: { userId: user.id } })
    await db.studySession.deleteMany({ where: { userId: user.id } })
    await db.user.delete({ where: { id: user.id } })
  }

  console.log(failures === 0 ? '\n✅ synchronisation hors ligne OK' : `\n❌ ${failures} échec(s)`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
