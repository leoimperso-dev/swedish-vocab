// Reads the error reports learners submitted from the app.
//
// Usage: pnpm tsx scripts/list-reports.ts [--all] [--resolve <id>]
//        default lists the open ones, newest first
import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const all = process.argv.includes('--all')
  const resolveAt = process.argv.indexOf('--resolve')

  if (resolveAt > 0) {
    const id = process.argv[resolveAt + 1]
    if (!id) { console.error('--resolve attend un id'); process.exit(1) }
    await db.errorReport.update({ where: { id }, data: { resolved: true } })
    console.log(`${id} marqué comme traité`)
    process.exit(0)
  }

  const reports = await db.errorReport.findMany({
    where: all ? {} : { resolved: false },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      word: { select: { term: true, translation: true, studyable: true } },
    },
  })

  if (reports.length === 0) {
    console.log(all ? 'Aucun signalement' : 'Aucun signalement ouvert')
    process.exit(0)
  }

  console.log(`${reports.length} signalement(s)${all ? '' : ' ouvert(s)'}\n`)
  for (const r of reports) {
    const when = r.createdAt.toISOString().slice(0, 16).replace('T', ' ')
    const who = r.user.name ?? r.user.email
    console.log(`[${r.id}] ${when} — ${who} — ${r.pair}${r.context ? ` / ${r.context}` : ''}${r.resolved ? ' (traité)' : ''}`)
    // What the reporter saw, then what the entry says now — a fix in between shows here
    if (r.shownTerm) console.log(`   vu :     ${r.shownTerm} — ${r.shownTranslation ?? ''}`)
    if (r.word) console.log(`   en base : ${r.word.term} — ${r.word.translation}${r.word.studyable ? '' : ' (hors exercices)'}`)
    console.log(`   « ${r.message} »\n`)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
