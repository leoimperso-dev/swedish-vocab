// Diagnostic: what the streak is built on, per account.
//
// Usage: pnpm tsx scripts/check-streaks.ts
import 'dotenv/config'
import { db } from '../lib/db'
import { toLocalDateString } from '../lib/streak'

function daysAgo(date: Date | null, timezone: string): string {
  if (!date) return 'never'
  const today = Date.parse(toLocalDateString(new Date(), timezone))
  const then = Date.parse(toLocalDateString(date, timezone))
  const days = Math.round((today - then) / 86400000)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
}

async function main() {
  const users = await db.user.findMany({
    select: {
      name: true, timezone: true, streakCurrent: true, streakBest: true,
      freezeCount: true, lastSeenAt: true, lastStudiedAt: true,
    },
    orderBy: { streakCurrent: 'desc' },
  })

  console.log('name            streak  best  frz  lastSeen      lastStudied')
  console.log('-'.repeat(68))
  for (const u of users) {
    console.log(
      (u.name ?? '?').padEnd(15) +
      String(u.streakCurrent).padStart(5) +
      String(u.streakBest).padStart(6) +
      String(u.freezeCount).padStart(5) +
      '  ' + daysAgo(u.lastSeenAt, u.timezone).padEnd(13) +
      daysAgo(u.lastStudiedAt, u.timezone),
    )
  }
  process.exit(0)
}

main()
