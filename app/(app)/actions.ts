'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function toggleLanguage() {
  const session = await auth()
  if (!session?.user?.id) return
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { nativeLanguage: true },
  })
  const next = user?.nativeLanguage === 'sv' ? 'fr' : 'sv'
  await db.user.update({ where: { id: session.user.id }, data: { nativeLanguage: next } })
  revalidatePath('/', 'layout')
}
