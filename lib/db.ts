import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

// The Prisma Rust engine cannot reach Supabase from this machine (IPv6/TLS),
// so all DB traffic goes through the node-postgres driver adapter instead.
// Supabase uses its own CA — pinned in certs/supabase-ca.pem for full TLS verification.
function createClient(): PrismaClient {
  const caPath = path.join(process.cwd(), 'certs', 'supabase-ca.pem')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath, 'utf-8') } : undefined,
  })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
