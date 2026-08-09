import { auth } from '@/auth'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
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
  if (!story || story.pair !== course.pair) notFound()

  return <StoryReader story={story} />
}
