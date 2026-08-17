import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCourse } from '@/lib/current-course'
import DialogueBrowser from '@/components/conversation/DialogueBrowser'

export default async function ConversationPage() {
  const session = await auth()
  const course = await getCourse(session!.user!.id)

  const dialogues = await db.dialogue.findMany({
    where: { pair: course.pair },
    select: { slug: true, title: true, titleTranslated: true, level: true, turns: true },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <DialogueBrowser
      // No key, no entry: an offer that leads straight to an error screen is
      // worse than no offer. The card appears the moment one is configured.
      chatEnabled={!!process.env.GROQ_API_KEY}
      dialogues={dialogues.map(({ turns, ...rest }) => ({
        ...rest,
        turnCount: Array.isArray(turns) ? turns.length : 0,
      }))}
    />
  )
}
