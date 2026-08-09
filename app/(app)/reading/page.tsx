import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import ReadingBrowser from '@/components/reading/ReadingBrowser'

export default async function ReadingPage() {
  const session = await auth()
  const course = await getCourse(session!.user!.id)

  const stories = await db.story.findMany({
    where: { pair: course.pair },
    select: { slug: true, title: true, titleTranslated: true, level: true, wordCount: true },
    orderBy: { createdAt: 'asc' },
  })

  return <ReadingBrowser stories={stories} />
}
