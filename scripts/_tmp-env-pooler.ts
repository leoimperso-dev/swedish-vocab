// Rewrites DATABASE_URL to the IPv4 session pooler before lib/db is loaded.
// Needed when the network has no IPv6 route (the direct host is IPv6-only).
// Usage: import this FIRST, then dynamically import whatever needs the db.
import 'dotenv/config'

const url = new URL(process.env.DATABASE_URL!)
const ref = url.hostname.split('.')[1] // db.<ref>.supabase.co
const pooler = new URL('postgresql://aws-0-eu-west-1.pooler.supabase.com:5432/postgres')
pooler.username = `postgres.${ref}`
pooler.password = url.password
process.env.DATABASE_URL = pooler.toString()
console.log('[pooler] DATABASE_URL basculée sur', pooler.hostname)
