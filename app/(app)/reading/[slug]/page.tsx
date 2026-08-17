import { auth } from '@/auth'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { learnsTermLanguage } from '@/lib/courses'
import { getCourse } from '@/lib/current-course'
import StoryReader from '@/components/reading/StoryReader'

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await auth()
  const [course, story] = await Promise.all([
    getCourse(session!.user!.id),
    db.story.findUnique({ where: { slug } }),
  ])
  // A story from another pair is not part of this course
  // ...and it is written in the pair's `term` language, so it is only a
  // story to someone learning that side — see the reading page
  if (!story || story.pair !== course.pair || !learnsTermLanguage(course)) notFound()

  return <StoryReader story={story} />
}
