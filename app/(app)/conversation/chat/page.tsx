import { auth } from '@/auth'
import { getCourseWithLevel } from '@/lib/current-course'
import { fallbackTopics } from '@/lib/chat/topics'
import ChatPlayer from '@/components/conversation/ChatPlayer'

// The written openers are rendered server-side so the screen is never empty;
// the client swaps in freshly generated ones as soon as they arrive.
export default async function ChatPage() {
  const session = await auth()
  const { course, level } = await getCourseWithLevel(session!.user!.id)
  return <ChatPlayer initialTopics={fallbackTopics(course.native, level)} />
}
