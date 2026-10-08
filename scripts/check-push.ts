// Diagnostic: who is actually eligible for the daily study reminder.
//
// Usage: pnpm tsx scripts/check-push.ts
import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const users = await db.user.findMany({
    select: {
      name: true, timezone: true,
      reminderEnabled: true, reminderHour: true,
      streakCurrent: true,
      _count: { select: { pushSubs: true } },
    },
  })

  const withSub = users.filter(u => u._count.pushSubs > 0)
  console.log(`Total users:                     ${users.length}`)
  console.log(`reminderEnabled = true:          ${users.filter(u => u.reminderEnabled).length}`)
  console.log(`has >= 1 push subscription:      ${withSub.length}`)
  console.log(`ELIGIBLE (enabled + has sub):    ${withSub.filter(u => u.reminderEnabled).length}`)
  console.log('')

  for (const u of users) {
    console.log(
      `${(u.name ?? '?').padEnd(14)} tz=${u.timezone.padEnd(16)} h=${String(u.reminderHour).padStart(2)} ` +
      `enabled=${u.reminderEnabled ? 'Y' : 'n'} subs=${u._count.pushSubs} streak=${u.streakCurrent}`,
    )
  }
  process.exit(0)
}

main()
