import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { resolveCourse } from '@/lib/courses'
import { levelFor } from '@/lib/cefr'
import { CourseProvider } from '@/components/CourseProvider'
import { StatsProvider } from '@/components/StatsProvider'
import BottomNav from '@/components/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.user!.id },
    select: {
      nativeLanguage: true,
      learningLanguage: true,
      levels: true,
      xp: true,
      streakCurrent: true,
      freezeCount: true,
    },
  })
  const course = resolveCourse(user?.nativeLanguage, user?.learningLanguage)
  const stats = {
    streak: user?.streakCurrent ?? 0,
    freezes: user?.freezeCount ?? 0,
    xp: user?.xp ?? 0,
  }

  return (
    <CourseProvider course={course} level={levelFor(user?.levels, course.learned)}>
      <StatsProvider stats={stats}>
        <div className="min-h-dvh">
          {children}
          <BottomNav />
        </div>
      </StatsProvider>
    </CourseProvider>
  )
}
