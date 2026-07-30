import { db } from '@/lib/db'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { asLang, getStrings } from '@/lib/i18n'
import MarkdownLite from '@/components/grammar/MarkdownLite'

export default async function GrammarLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await auth()
  const [user, lesson] = await Promise.all([
    db.user.findUnique({ where: { id: session!.user!.id }, select: { nativeLanguage: true } }),
    db.grammarLesson.findUnique({ where: { slug } }),
  ])
  if (!lesson) notFound()
  const t = getStrings(asLang(user?.nativeLanguage))

  const [previous, next] = await Promise.all([
    db.grammarLesson.findFirst({
      where: { order: { lt: lesson.order } },
      orderBy: { order: 'desc' },
      select: { slug: true, title: true },
    }),
    db.grammarLesson.findFirst({
      where: { order: { gt: lesson.order } },
      orderBy: { order: 'asc' },
      select: { slug: true, title: true },
    }),
  ])

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-5">
      <div>
        <Link href="/grammar" className="text-slate-400 text-sm cursor-pointer hover:text-slate-200">
          {t.back}
        </Link>
        <p className="text-blue-400 text-xs font-semibold uppercase tracking-wide mt-2">{lesson.category}</p>
        <h1 className="text-2xl font-bold mt-1">{lesson.title}</h1>
      </div>

      <MarkdownLite body={lesson.body} />

      <div className="flex gap-3 pt-4">
        {previous && (
          <Link
            href={`/grammar/${previous.slug}`}
            className="flex-1 p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="block text-slate-500 text-xs">←</span>
            <span className="text-sm font-medium">{previous.title}</span>
          </Link>
        )}
        {next && (
          <Link
            href={`/grammar/${next.slug}`}
            className="flex-1 p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 transition-colors cursor-pointer text-right"
          >
            <span className="block text-slate-500 text-xs">→</span>
            <span className="text-sm font-medium">{next.title}</span>
          </Link>
        )}
      </div>
    </main>
  )
}
