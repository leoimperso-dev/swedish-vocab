import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify, pushEnabled } from '@/lib/push'
import { getStrings } from '@/lib/i18n'
import { toLocalDateString } from '@/lib/streak'

// Meant to be called once an hour; each learner is nudged in the hour that
// matches their own timezone. Reading every user once an hour is cheap at this
// scale, and much simpler than storing a next-due timestamp that has to be
// recomputed whenever someone moves or changes the hour.
//
// Driven from cron-job.org rather than vercel.json: the Hobby plan allows one
// daily cron, and a single fixed UTC hour cannot serve a per-user local hour —
// it would also drift by an hour at every daylight-saving change.
// Call with: Authorization: Bearer $CRON_SECRET
export const dynamic = 'force-dynamic'

/** Hour 0-23 in a given timezone, right now. */
function localHour(timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', hour12: false,
  }).format(new Date())
  // "24" is how some environments spell midnight
  return Number(formatted) % 24
}

export async function GET(req: NextRequest) {
  // Refused outright when unconfigured: an open endpoint that sends push
  // notifications to every user is not something to leave running by default
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!pushEnabled) return NextResponse.json({ skipped: 'push not configured' })

  const users = await db.user.findMany({
    where: { reminderEnabled: true, pushSubs: { some: {} } },
    select: {
      id: true, timezone: true, reminderHour: true, nativeLanguage: true,
      lastStudiedAt: true, streakCurrent: true,
    },
  })

  let sent = 0
  await Promise.all(
    users.map(async user => {
      if (localHour(user.timezone) !== user.reminderHour) return
      // Someone who already studied today does not need telling
      const today = toLocalDateString(new Date(), user.timezone)
      if (user.lastStudiedAt && toLocalDateString(user.lastStudiedAt, user.timezone) === today) return

      const t = getStrings(user.nativeLanguage)
      await notify(user.id, {
        title: t.reminderPushTitle,
        body: user.streakCurrent > 0
          ? t.reminderPushStreak(user.streakCurrent)
          : t.reminderPushBody,
        url: '/study',
        // One reminder a day replaces the previous, never stacks
        tag: `reminder-${today}`,
      })
      sent++
    }),
  )

  return NextResponse.json({ considered: users.length, sent })
}
