import { auth } from '@/auth'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { learnsTermLanguage } from '@/lib/courses'
import { getCourse } from '@/lib/current-course'
import DialoguePlayer from '@/components/conversation/DialoguePlayer'

export default async function DialoguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await auth()
  const [course, dialogue] = await Promise.all([
    getCourse(session!.user!.id),
    db.dialogue.findUnique({ where: { slug } }),
  ])
  // A dialogue from another pair is not part of this course
  // ...and it is spoken in the pair's `term` language — see the conversation page
  if (!dialogue || dialogue.pair !== course.pair || !learnsTermLanguage(course)) notFound()

  return <DialoguePlayer dialogue={dialogue} />
}
