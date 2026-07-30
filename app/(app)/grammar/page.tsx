import { db } from '@/lib/db'
import { auth } from '@/auth'
import Link from 'next/link'
import { asLang, getStrings } from '@/lib/i18n'

export default async function GrammarPage() {
  const session = await auth()
  const [user, lessons] = await Promise.all([
    db.user.findUnique({ where: { id: session!.user!.id }, select: { nativeLanguage: true } }),
    db.grammarLesson.findMany({
      select: { slug: true, title: true, category: true, order: true },
      orderBy: { order: 'asc' },
    }),
  ])
  const t = getStrings(asLang(user?.nativeLanguage))

  const categories = new Map<string, typeof lessons>()
  for (const lesson of lessons) {
    const group = categories.get(lesson.category)
    if (group) group.push(lesson)
    else categories.set(lesson.category, [lesson])
  }

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t.grammarTitle}</h1>
        <p className="text-slate-400 text-sm mt-1">{t.grammarSubtitle(lessons.length)}</p>
      </div>

      {[...categories.entries()].map(([category, categoryLessons]) => (
        <div key={category} className="space-y-2">
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wide">{category}</h2>
          <div className="bg-slate-900 rounded-2xl divide-y divide-slate-800">
            {categoryLessons.map(lesson => (
              <Link
                key={lesson.slug}
                href={`/grammar/${lesson.slug}`}
                className="block px-4 py-3 hover:bg-slate-800 transition-colors cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
              >
                <span className="font-medium">{lesson.title}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </main>
  )
}
