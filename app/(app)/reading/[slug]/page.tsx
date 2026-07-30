import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import StoryReader from '@/components/reading/StoryReader'

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const story = await db.story.findUnique({ where: { slug } })
  if (!story) notFound()

  return <StoryReader story={story} />
}
