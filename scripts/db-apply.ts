import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Client } from 'pg'

// Applies a SQL file to the database through node-postgres.
// Needed because the Prisma engine cannot reach Supabase from this machine (see CLAUDE.md).
// Usage: tsx scripts/db-apply.ts <file.sql>

async function main() {
  const sqlFile = process.argv[2]
  if (!sqlFile) {
    console.error('Usage: tsx scripts/db-apply.ts <file.sql>')
    process.exit(1)
  }

  const sql = fs.readFileSync(sqlFile, 'utf-8')
  const caPath = path.join(process.cwd(), 'certs', 'supabase-ca.pem')
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { ca: fs.readFileSync(caPath, 'utf-8') },
  })

  await client.connect()
  try {
    await client.query(sql)
    console.log(`✅ Applied ${sqlFile}`)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
