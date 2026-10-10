'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { COURSES } from '@/lib/courses'
import { isCefrLevel, levelFor } from '@/lib/cefr'
import { revalidatePath } from 'next/cache'
import { rememberLang } from '@/lib/ui-lang'

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
  // The login screen and <html lang> follow the interface the user last chose
  await rememberLang(course.native)
  revalidatePath('/', 'layout')
}

// Records the level the user declares for one learned language. Levels are kept
// per language in a single JSON column: switching courses must not lose the
// level set for the other ones.
export async function setLevel(learned: string, level: string) {
  const session = await auth()
  if (!session?.user?.id || !isCefrLevel(level)) return
  if (!COURSES.some(c => c.learned === learned)) return

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { levels: true },
  })
  const levels = (user?.levels && typeof user.levels === 'object' ? user.levels : {}) as Record<string, string>

  await db.user.update({
    where: { id: session.user.id },
    data: { levels: { ...levels, [learned]: level } },
  })
  revalidatePath('/', 'layout')
}

/** Reads back the level of the course currently selected, null if never set. */
export async function getMyLevel(learned: string) {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { levels: true },
  })
  return levelFor(user?.levels, learned)
}
