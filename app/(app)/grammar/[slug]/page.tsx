import { db } from '@/lib/db'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { asLang, getStrings } from '@/lib/i18n'
import MarkdownLite from '@/components/grammar/MarkdownLite'
import { AppShell } from '@/components/AppShell'

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
    <AppShell title={lesson.title} subtitle={lesson.category}>
      <div className="space-y-5">
        <Link
          href="/grammar"
          className="pressable inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          {t.back}
        </Link>

        <MarkdownLite body={lesson.body} />

        <div className="flex gap-3 pt-1">
          {previous && (
            <Link href={`/grammar/${previous.slug}`} className="pressable card-surface flex-1 p-3">
              <ChevronLeft size={14} className="text-muted-foreground" />
              <span className="mt-1 block truncate text-sm font-medium">{previous.title}</span>
            </Link>
          )}
          {next && (
            <Link href={`/grammar/${next.slug}`} className="pressable card-surface flex-1 p-3 text-right">
              <ChevronRight size={14} className="ml-auto text-muted-foreground" />
              <span className="mt-1 block truncate text-sm font-medium">{next.title}</span>
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  )
}
