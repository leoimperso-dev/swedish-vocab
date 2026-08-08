// Server-side resolution of the signed-in user's course.
import { db } from '@/lib/db'
import { resolveCourse, type Course } from '@/lib/courses'

export async function getCourse(userId: string): Promise<Course> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nativeLanguage: true, learningLanguage: true },
  })
  return resolveCourse(user?.nativeLanguage, user?.learningLanguage)
}
