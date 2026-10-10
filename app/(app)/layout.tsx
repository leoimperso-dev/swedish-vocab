import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { resolveCourse } from '@/lib/courses'
import { levelFor } from '@/lib/cefr'
import { CourseProvider } from '@/components/CourseProvider'
import { FavoritesProvider } from '@/components/FavoritesProvider'
import { StatsProvider } from '@/components/StatsProvider'
import { pendingDuelCount } from '@/lib/duel/service'
import { toLocalDateString, updateStreak } from '@/lib/streak'
import BottomNav from '@/components/BottomNav'

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const [user, favorites, pendingDuels] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user!.id },
      select: {
        nativeLanguage: true,
        learningLanguage: true,
        levels: true,
        xp: true,
        streakCurrent: true,
        streakBest: true,
        freezeCount: true,
        lastSeenAt: true,
        timezone: true,
      },
    }),
    // Ids are unique across pairs, so one set serves every course
    db.favorite.findMany({ where: { userId: session.user!.id }, select: { wordId: true } }),
    pendingDuelCount(session.user!.id),
  ])
  // Opening the app is what the streak counts, so this is where it advances.
  // "Last seen" is written at most once per window — opening five pages in a
  // row is one write, not five — but the streak is settled from the value read
  // before that write, which still holds the previous visit.
  let streak = user?.streakCurrent ?? 0
  let freezes = user?.freezeCount ?? 0

  // The throttle must never swallow a day boundary: a visit at 23:58 and one
  // at 00:01 are two days, three minutes apart
  const crossedIntoNewDay =
    !!user?.lastSeenAt &&
    toLocalDateString(user.lastSeenAt, user.timezone) !== toLocalDateString(new Date(), user.timezone)

  if (user && (!user.lastSeenAt || crossedIntoNewDay
    || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS)) {
    const advanced = updateStreak(
      user.lastSeenAt, user.streakCurrent, user.streakBest, user.timezone, user.freezeCount,
    )
    streak = advanced.streakCurrent
    freezes = advanced.freezeCount
    await db.user.update({
      where: { id: session.user!.id },
      data: {
        lastSeenAt: new Date(),
        streakCurrent: advanced.streakCurrent,
        streakBest: advanced.streakBest,
        freezeCount: advanced.freezeCount,
      },
    })
  }

  const course = resolveCourse(user?.nativeLanguage, user?.learningLanguage)
  const stats = {
    streak,
    freezes,
    xp: user?.xp ?? 0,
    pendingDuels,
  }

  return (
    <CourseProvider course={course} level={levelFor(user?.levels, course.learned)}>
      <FavoritesProvider initial={favorites.map(f => f.wordId)}>
        <StatsProvider stats={stats}>
          <div className="min-h-dvh">
            {children}
            <BottomNav />
          </div>
        </StatsProvider>
      </FavoritesProvider>
    </CourseProvider>
  )
}
