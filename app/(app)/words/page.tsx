'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatForms, parseDetails } from '@/lib/word-display'
import { MAX_KNOWLEDGE_LEVEL } from '@/lib/sm2'
import { getStrings, type Lang } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'

const TOP_LIST_SIZE = 3000
const PAGE_STEP = 300

interface ApiWord {
  id: string
  swedish: string
  french: string
  category: string | null
  source: string | null
  forms: unknown
  details: unknown
  frequencyRank: number | null
  hasExamples: boolean
  level: number
  favorite: boolean
}

interface WordExample {
  sv: string
  fr?: string
}

type Tab = 'categories' | 'top' | 'favorites'

export default function WordsPage() {
  const lang = useLang()
  const t = getStrings(lang)
  const [words, setWords] = useState<ApiWord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('categories')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [topVisible, setTopVisible] = useState(PAGE_STEP)

  useEffect(() => {
    // Stale-while-revalidate: show the cached list instantly, refresh in the background
    try {
      const cached = sessionStorage.getItem('words-cache-v1')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed.words)) {
          setWords(parsed.words)
          setLoading(false)
        }
      }
    } catch {}

    fetch('/api/words')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data.words)) return
        setWords(data.words)
        setLoading(false)
        try {
          sessionStorage.setItem('words-cache-v1', JSON.stringify({ words: data.words }))
        } catch {}
      })
      .catch(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const labels = { personal: t.personalList, misc: t.misc }
    const map = new Map<string, ApiWord[]>()
    for (const word of words) {
      const label = word.source === 'Swedish.txt'
        ? labels.personal
        : (word.category ?? labels.misc).replace(/\s+2$/, '')
      const group = map.get(label)
      if (group) group.push(word)
      else map.set(label, [word])
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === labels.personal) return -1
      if (b === labels.personal) return 1
      return a.localeCompare(b, 'fr')
    })
  }, [words, t])

  const topWords = useMemo(
    () => words
      .filter(w => w.frequencyRank !== null && w.frequencyRank <= TOP_LIST_SIZE)
      .sort((a, b) => a.frequencyRank! - b.frequencyRank!),
    [words]
  )

  const favoriteWords = useMemo(() => words.filter(w => w.favorite), [words])

  const toggleFavorite = (wordId: string) => {
    const word = words.find(w => w.id === wordId)
    if (!word) return
    const next = !word.favorite
    setWords(ws => ws.map(w => (w.id === wordId ? { ...w, favorite: next } : w)))
    fetch('/api/words/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordId, favorite: next }),
    }).catch(() => {
      setWords(ws => ws.map(w => (w.id === wordId ? { ...w, favorite: !next } : w)))
    })
  }

  const toggleCategory = (label: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-slate-400">{t.loading}</p>
      </main>
    )
  }

  return (
    <main className="px-4 pt-12 pb-6 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t.vocabularyTitle}</h1>
        <p className="text-slate-400 text-sm mt-1">
          {t.wordsAndCategories(words.length, groups.length)}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900 rounded-2xl p-1">
        <TabBtn label={t.tabCategories} active={tab === 'categories'} onClick={() => setTab('categories')} />
        <TabBtn label={t.tabTop} active={tab === 'top'} onClick={() => setTab('top')} />
        <TabBtn label={t.tabFavorites} active={tab === 'favorites'} onClick={() => setTab('favorites')} />
      </div>

      {tab === 'categories' && (
        <div className="space-y-2">
          {groups.map(([label, groupWords]) => {
            const open = openCategories.has(label)
            return (
              <div key={label} className="bg-slate-900 rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleCategory(label)}
                  className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
                >
                  <span className="font-semibold capitalize">{label.toLowerCase()}</span>
                  <span className="text-slate-500 text-sm">{groupWords.length} {open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div className="px-4 pb-3 divide-y divide-slate-800">
                    {groupWords.map(word => (
                      <WordRow key={word.id} word={word} lang={lang} onToggleFavorite={toggleFavorite} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'top' && (
        <div className="space-y-2">
          <div className="bg-slate-900 rounded-2xl px-4 divide-y divide-slate-800">
            {topWords.slice(0, topVisible).map(word => (
              <WordRow key={word.id} word={word} lang={lang} onToggleFavorite={toggleFavorite} showRank />
            ))}
          </div>
          {topVisible < topWords.length && (
            <button
              onClick={() => setTopVisible(v => v + PAGE_STEP)}
              className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer active:scale-98 transition-all"
            >
              {t.showMore} ({topVisible} / {topWords.length})
            </button>
          )}
        </div>
      )}

      {tab === 'favorites' && (
        favoriteWords.length > 0 ? (
          <div className="bg-slate-900 rounded-2xl px-4 divide-y divide-slate-800">
            {favoriteWords.map(word => (
              <WordRow key={word.id} word={word} lang={lang} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        ) : (
          <p className="text-center py-12 text-slate-500 text-sm">{t.noFavorites}</p>
        )
      )}
    </main>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
        active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function WordRow({ word, lang, onToggleFavorite, showRank }: {
  word: ApiWord
  lang: Lang
  onToggleFavorite: (id: string) => void
  showRank?: boolean
}) {
  const forms = formatForms(word.forms)
  const details = parseDetails(word.details)
  const [examples, setExamples] = useState<WordExample[] | null>(null)
  const [showExamples, setShowExamples] = useState(false)

  const toggleExamples = async () => {
    if (showExamples) { setShowExamples(false); return }
    setShowExamples(true)
    if (examples === null) {
      try {
        const res = await fetch(`/api/words/examples?wordId=${word.id}`)
        const data = await res.json()
        setExamples(Array.isArray(data.examples) ? data.examples : [])
      } catch {
        setExamples([])
      }
    }
  }

  return (
    <div className="py-1.5 text-sm">
      <div className="flex items-baseline gap-2">
        <button
          onClick={() => onToggleFavorite(word.id)}
          className={`cursor-pointer text-base leading-none ${word.favorite ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
          {word.favorite ? '★' : '☆'}
        </button>
        {showRank && word.frequencyRank !== null && (
          <span className="text-slate-600 text-xs w-9 shrink-0">#{word.frequencyRank}</span>
        )}
        <span className="flex-1 font-medium">
          {word.swedish}
          {forms && <span className="text-slate-500 font-normal text-xs"> ({forms})</span>}
        </span>
        <span className="flex-1 text-slate-400">
          {lang === 'fr' && details?.translations ? details.translations.join(', ') : word.french}
        </span>
        {word.hasExamples && (
          <button
            onClick={toggleExamples}
            className={`cursor-pointer text-xs leading-none self-center ${showExamples ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
          >
            💬
          </button>
        )}
        <LevelDots level={word.level} />
      </div>
      {lang === 'fr' && details?.context && (
        <p className="text-slate-600 text-xs italic mt-0.5">{details.context}</p>
      )}
      {details?.usage?.map(u => (
        <p key={u.sv} className="text-xs text-slate-500 mt-0.5">
          <span className="text-slate-400">{u.sv}</span> — {u.fr}
        </p>
      ))}
      {showExamples && (
        <div className="mt-1 mb-1 pl-3 border-l-2 border-slate-700 space-y-1">
          {examples === null ? (
            <p className="text-xs text-slate-500">…</p>
          ) : examples.length === 0 ? (
            <p className="text-xs text-slate-600">—</p>
          ) : (
            examples.map(ex => (
              <div key={ex.sv} className="text-xs">
                <p className="text-slate-300">{ex.sv}</p>
                {ex.fr && <p className="text-slate-500 italic">{ex.fr}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function LevelDots({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5 shrink-0 self-center" title={`${level} / ${MAX_KNOWLEDGE_LEVEL}`}>
      {Array.from({ length: MAX_KNOWLEDGE_LEVEL }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < level ? 'bg-green-500' : 'bg-slate-700'}`}
        />
      ))}
    </span>
  )
}
