import { auth } from '@/auth'
import { db } from '@/lib/db'
import { formatForms, parseDetails } from '@/lib/word-display'
import { asLang, getStrings } from '@/lib/i18n'

function displayCategory(category: string | null, source: string | null, labels: { personal: string; misc: string }): string {
  if (source === 'Swedish.txt') return labels.personal
  // Merge generation-chunk suffixes ("VERBES 2" → "VERBES")
  return (category ?? labels.misc).replace(/\s+2$/, '')
}

export default async function WordsPage() {
  const session = await auth()
  const [user, words] = await Promise.all([
    db.user.findUnique({ where: { id: session!.user!.id }, select: { nativeLanguage: true } }),
    db.word.findMany({
      select: { id: true, swedish: true, french: true, category: true, source: true, forms: true, details: true },
      orderBy: { swedish: 'asc' },
    }),
  ])
  const lang = asLang(user?.nativeLanguage)
  const t = getStrings(lang)
  const labels = { personal: t.personalList, misc: t.misc }

  const groups = new Map<string, typeof words>()
  for (const word of words) {
    const label = displayCategory(word.category, word.source, labels)
    const group = groups.get(label)
    if (group) group.push(word)
    else groups.set(label, [word])
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === labels.personal) return -1
    if (b === labels.personal) return 1
    return a.localeCompare(b, 'fr')
  })

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t.vocabularyTitle}</h1>
        <p className="text-slate-400 text-sm mt-1">
          {t.wordsAndCategories(words.length, sortedGroups.length)}
        </p>
      </div>

      <div className="space-y-2">
        {sortedGroups.map(([label, groupWords]) => (
          <details key={label} className="bg-slate-900 rounded-2xl overflow-hidden">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span className="font-semibold capitalize">{label.toLowerCase()}</span>
              <span className="text-slate-500 text-sm">{groupWords.length}</span>
            </summary>
            <div className="px-4 pb-3 divide-y divide-slate-800">
              {groupWords.map(word => {
                const forms = formatForms(word.forms)
                const details = parseDetails(word.details)
                return (
                  <div key={word.id} className="py-1.5 text-sm">
                    <div className="flex items-baseline gap-3">
                      <span className="flex-1 font-medium">
                        {word.swedish}
                        {forms && <span className="text-slate-500 font-normal text-xs"> ({forms})</span>}
                      </span>
                      <span className="flex-1 text-slate-400">
                        {lang === 'fr' && details?.translations ? details.translations.join(', ') : word.french}
                      </span>
                    </div>
                    {lang === 'fr' && details?.context && (
                      <p className="text-slate-600 text-xs italic mt-0.5">{details.context}</p>
                    )}
                    {details?.usage?.map(u => (
                      <p key={u.sv} className="text-xs text-slate-500 mt-0.5">
                        <span className="text-slate-400">{u.sv}</span> — {u.fr}
                      </p>
                    ))}
                  </div>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </main>
  )
}
