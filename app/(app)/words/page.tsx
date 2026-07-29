import { db } from '@/lib/db'

const PERSONAL_LIST_LABEL = 'Ma liste personnelle'
const NO_CATEGORY_LABEL = 'Divers'

// Display order: verb tenses, then noun plural, then adjective forms
const FORM_ORDER = ['present', 'preterit', 'supine', 'plural', 'ett', 'comparative', 'superlative']

function formatForms(forms: unknown): string | null {
  if (!forms || typeof forms !== 'object') return null
  const record = forms as Record<string, string>
  const parts = FORM_ORDER.filter(key => record[key]).map(key => record[key])
  return parts.length > 0 ? parts.join(', ') : null
}

function displayCategory(category: string | null, source: string | null): string {
  if (source === 'Swedish.txt') return PERSONAL_LIST_LABEL
  // Merge generation-chunk suffixes ("VERBES 2" → "VERBES")
  return (category ?? NO_CATEGORY_LABEL).replace(/\s+2$/, '')
}

export default async function WordsPage() {
  const words = await db.word.findMany({
    select: { id: true, swedish: true, french: true, category: true, source: true, forms: true },
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
                return (
                  <div key={word.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                    <span className="flex-1 font-medium">
                      {word.swedish}
                      {forms && <span className="text-slate-500 font-normal text-xs"> ({forms})</span>}
                    </span>
                    <span className="flex-1 text-slate-400">{word.french}</span>
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
