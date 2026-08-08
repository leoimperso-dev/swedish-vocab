import { db } from '@/lib/db'
import { auth } from '@/auth'
import Link from 'next/link'
import { BookOpen, ChevronRight } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { getCourse } from '@/lib/current-course'
import { AppShell } from '@/components/AppShell'
import { SectionLabel } from '@/components/ui/primitives'

export default async function GrammarPage() {
  const session = await auth()
  const course = await getCourse(session!.user!.id)
  const lessons = await db.grammarLesson.findMany({
    where: { pair: course.pair },
    select: { slug: true, title: true, category: true, order: true },
    orderBy: { order: 'asc' },
  })
  const t = getStrings(course.native)

  const categories = new Map<string, typeof lessons>()
  for (const lesson of lessons) {
    const group = categories.get(lesson.category)
    if (group) group.push(lesson)
    else categories.set(lesson.category, [lesson])
  }

  return (
    <AppShell title={t.grammarTitle} subtitle={t.grammarSubtitle(lessons.length)}>
      <div className="space-y-5">
        {[...categories.entries()].map(([category, categoryLessons]) => (
          <div key={category} className="space-y-2">
            <SectionLabel>{category}</SectionLabel>
            <div className="space-y-3">
              {categoryLessons.map(lesson => (
                <Link
                  key={lesson.slug}
                  href={`/grammar/${lesson.slug}`}
                  className="pressable card-surface flex items-center gap-3.5 p-4"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-raised">
                    <BookOpen size={20} className="text-info" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-base font-semibold">
                    {lesson.title}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
