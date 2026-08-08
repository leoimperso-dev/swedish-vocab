'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { COURSES } from '@/lib/courses'
import { revalidatePath } from 'next/cache'

// Switches the signed-in user to another course. The (native, learned) couple is
// validated against the registry, so an unknown combination is a no-op.
export async function setCourse(native: string, learned: string) {
  const session = await auth()
  if (!session?.user?.id) return

  const course = COURSES.find(c => c.native === native && c.learned === learned)
  if (!course) return

  await db.user.update({
    where: { id: session.user.id },
    data: { nativeLanguage: course.native, learningLanguage: course.learned },
  })
  revalidatePath('/', 'layout')
}
