// QA before import-stories.ts: schema, slug clashes (DB and batch) and dictionary coverage of
// every stories-*.json under <root>/<pair>/. Proper nouns and digits are expected misses.
// Usage: pnpm tsx scripts/check-story-json.ts <root-dir-with-pair-subdirs> [file-filter]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import { lookupWord } from '../lib/dictionary'
import type { PairId } from '../lib/courses'

const LEVELS = new Set(['beginner', 'intermediate', 'expert', 'dialogue'])
const tokenize = (body: string) => body.split(/(\s+)/).filter(t => !/^\s*$/.test(t))
  .map(t => t.toLowerCase().replace(/[.,!?¿¡;:"«»()[\]…'’„“”–—]/g, '').trim()).filter(Boolean)

async function main() {
  const [root, filter = ''] = process.argv.slice(2)
  const existing = new Set((await db.story.findMany({ select: { slug: true } })).map(s => s.slug))
  const seen = new Set<string>()
  for (const pair of ['sv-fr', 'en-fr', 'nl-fr', 'es-fr'] as PairId[]) {
    const dir = path.join(root, pair)
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).filter(f => /^stories-.*\.json$/.test(f) && f.includes(filter)).sort()) {
      let records: any[]
      try { records = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) } catch (e) { console.log(`${pair}/${file}: INVALID JSON ${e}`); continue }
      for (const r of records) {
        const problems: string[] = []
        if (!r?.slug || !r?.title || !r?.titleTranslated || !r?.body || !LEVELS.has(r.level)) problems.push('missing field/level')
        if (existing.has(r.slug)) problems.push('slug already in DB')
        if (seen.has(r.slug)) problems.push('duplicate slug in batch')
        seen.add(r.slug)
        const missing: string[] = []
        for (const token of new Set(tokenize(r.body ?? ''))) if (!(await lookupWord(token, pair))) missing.push(token)
        const words = (r.body ?? '').split(/\s+/).filter(Boolean).length
        console.log(`${pair}/${file} ${r.slug} [${r.level}, ${words} mots]${problems.length ? ' !! ' + problems.join('; ') : ''}${missing.length ? ' — absents: ' + missing.join(', ') : ' — OK'}`)
      }
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
