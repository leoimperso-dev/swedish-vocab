import path from 'path'
import { PrismaClient } from '@prisma/client'
import { parseAllVocabulary } from '../scripts/parse-vocabulary'
import { ACHIEVEMENTS } from '../lib/achievements'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding achievements...')
  await db.achievement.createMany({
    data: ACHIEVEMENTS,
    skipDuplicates: true,
  })

  console.log('🌱 Parsing vocabulary files...')
  const dataDir = path.join(__dirname, '..', '..', '..', 'Desktop', 'pro')
  const words = parseAllVocabulary(dataDir)

  console.log(`🌱 Inserting ${words.length} words...`)
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize)
    const result = await db.word.createMany({
      data: batch.map(w => ({
        swedish: w.swedish,
        french: w.french,
        wordType: w.wordType,
        category: w.category,
        forms: w.forms ?? undefined,
        source: w.source,
      })),
      skipDuplicates: true,
    })
    inserted += result.count
  }

  console.log(`✅ Inserted ${inserted} words (${words.length - inserted} skipped as duplicates)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
