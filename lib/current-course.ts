// Server-side resolution of the signed-in user's course.
import { db } from '@/lib/db'
import { resolveCourse, type Course } from '@/lib/courses'
import { levelFor, type CefrLevel } from '@/lib/cefr'

export async function getCourse(userId: string): Promise<Course> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nativeLanguage: true, learningLanguage: true },
  })
  return resolveCourse(user?.nativeLanguage, user?.learningLanguage)
}

/** The course plus the level declared for its learned language, null if unset. */
export async function getCourseWithLevel(
  userId: string,
): Promise<{ course: Course; level: CefrLevel | null }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nativeLanguage: true, learningLanguage: true, levels: true },
  })
  const course = resolveCourse(user?.nativeLanguage, user?.learningLanguage)
  return { course, level: levelFor(user?.levels, course.learned) }
}
