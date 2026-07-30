import { db } from '@/lib/db'
import ReadingBrowser from '@/components/reading/ReadingBrowser'

export default async function ReadingPage() {
  const stories = await db.story.findMany({
    select: { slug: true, title: true, titleFrench: true, level: true, wordCount: true },
    orderBy: { createdAt: 'asc' },
  })

  return <ReadingBrowser stories={stories} />
}
