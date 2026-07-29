import { db } from '@/lib/db'
import { formatForms, parseDetails } from '@/lib/word-display'

const PERSONAL_LIST_LABEL = 'Ma liste personnelle'
const NO_CATEGORY_LABEL = 'Divers'

function displayCategory(category: string | null, source: string | null): string {
  if (source === 'Swedish.txt') return PERSONAL_LIST_LABEL
  // Merge generation-chunk suffixes ("VERBES 2" → "VERBES")
  return (category ?? NO_CATEGORY_LABEL).replace(/\s+2$/, '')
}

export default async function WordsPage() {
  const words = await db.word.findMany({
    select: { id: true, swedish: true, french: true, category: true, source: true, forms: true, details: true },
    orderBy: { swedish: 'asc' },
  })

  const groups = new Map<string, typeof words>()
  for (const word of words) {
    const label = displayCategory(word.category, word.source)
    const group = groups.get(label)
    if (group) group.push(word)
    else groups.set(label, [word])
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === PERSONAL_LIST_LABEL) return -1
    if (b === PERSONAL_LIST_LABEL) return 1
    return a.localeCompare(b, 'fr')
  })

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Vocabulaire</h1>
        <p className="text-slate-400 text-sm mt-1">
          {words.length} mots · {sortedGroups.length} catégories
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
                        {details?.translations ? details.translations.join(', ') : word.french}
                      </span>
                    </div>
                    {details?.context && (
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
