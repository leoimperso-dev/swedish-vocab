import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { learnsTermLanguage } from '@/lib/courses'
import { getCourse } from '@/lib/current-course'
import ReadingBrowser from '@/components/reading/ReadingBrowser'

export default async function ReadingPage() {
  const session = await auth()
  const course = await getCourse(session!.user!.id)

  // Stories, dialogues and grammar are authored in the pair's `term` language:
  // to a learner of the other side they are their own native language, read by
  // a voice of the language they are learning. Hiding the links is not enough —
  // the URL stays reachable.
  if (!learnsTermLanguage(course)) redirect('/study')

  const stories = await db.story.findMany({
    where: { pair: course.pair },
    select: { slug: true, title: true, titleTranslated: true, level: true, wordCount: true },
    orderBy: { createdAt: 'asc' },
  })

  return <ReadingBrowser stories={stories} />
}
