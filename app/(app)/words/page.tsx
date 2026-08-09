'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, MessageSquare, Star } from 'lucide-react'
import { formatForms, parseDetails } from '@/lib/word-display'
import { MAX_KNOWLEDGE_LEVEL } from '@/lib/sm2'
import { getStrings } from '@/lib/i18n'
import { learnsTermLanguage, localeOf, type Course } from '@/lib/courses'
import { useCourse } from '@/components/CourseProvider'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/AppShell'
import { LevelDots, Segmented, SectionLabel } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { EmptyState, ListSkeleton } from '@/components/ui/feedback'

const TOP_LIST_SIZE = 3000
const PAGE_STEP = 300

interface ApiWord {
  id: string
  term: string
  translation: string
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
  term: string
  translation?: string
}

type Tab = 'categories' | 'top' | 'favorites'

export default function WordsPage() {
  const course = useCourse()
  const t = getStrings(course.native)
  const [words, setWords] = useState<ApiWord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('categories')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [topVisible, setTopVisible] = useState(PAGE_STEP)

  useEffect(() => {
    // Cache key carries the pair — switching course must not flash the other vocabulary
    const cacheKey = `words-cache-v2-${course.pair}`
    setLoading(true)
    // Stale-while-revalidate: show the cached list instantly, refresh in the background
    try {
      const cached = sessionStorage.getItem(cacheKey)
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
          sessionStorage.setItem(cacheKey, JSON.stringify({ words: data.words }))
        } catch {}
      })
      .catch(() => setLoading(false))
  }, [course.pair])

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
      return a.localeCompare(b, localeOf(course.native))
    })
  }, [words, t, course.native])

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

  const tabOptions = [
    { value: 'categories', label: t.tabCategories },
    { value: 'top', label: t.tabTop(TOP_LIST_SIZE) },
    { value: 'favorites', label: t.tabFavorites },
  ]

  return (
    <AppShell
      title={t.vocabularyTitle}
      subtitle={loading ? undefined : t.wordsAndCategories(words.length, groups.length)}
    >
      <div className="space-y-4">
        <Segmented options={tabOptions} value={tab} onChange={v => setTab(v as Tab)} />

        {loading ? (
          <ListSkeleton rows={5} />
        ) : tab === 'categories' ? (
          <div className="space-y-2">
            {groups.map(([label, groupWords]) => {
              const open = openCategories.has(label)
              return (
                <div key={label} className="card-surface overflow-hidden">
                  <button
                    onClick={() => toggleCategory(label)}
                    aria-expanded={open}
                    className="pressable flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold capitalize">
                      {label.toLowerCase()}
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {groupWords.length}
                    </span>
                    <ChevronDown
                      size={17}
                      className={cn(
                        'shrink-0 text-muted-foreground transition-transform duration-200',
                        open && 'rotate-180',
                      )}
                    />
                  </button>
                  {open ? (
                    <div className="animate-rise space-y-2 border-t border-border bg-background/40 p-2">
                      {groupWords.map(word => (
                        <WordRow key={word.id} word={word} course={course} onToggleFavorite={toggleFavorite} />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : tab === 'top' ? (
          <div className="space-y-2">
            <SectionLabel>{t.topWordsHint}</SectionLabel>
            {topWords.slice(0, topVisible).map(word => (
              <WordRow key={word.id} word={word} course={course} onToggleFavorite={toggleFavorite} showRank />
            ))}
            {topVisible < topWords.length ? (
              <Button variant="secondary" className="w-full" onClick={() => setTopVisible(v => v + PAGE_STEP)}>
                {t.showMore} ({topVisible} / {topWords.length})
              </Button>
            ) : null}
          </div>
        ) : favoriteWords.length > 0 ? (
          <div className="space-y-2">
            {favoriteWords.map(word => (
              <WordRow key={word.id} word={word} course={course} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Star size={22} className="text-accent" />} title={t.noFavorites} />
        )}
      </div>
    </AppShell>
  )
}

function WordRow({ word, course, onToggleFavorite, showRank }: {
  word: ApiWord
  course: Course
  onToggleFavorite: (id: string) => void
  showRank?: boolean
}) {
  const t = getStrings(course.native)
  // Enrichment (alternative translations, context) is written in the pair's
  // `translation` language, which is the native one exactly when `term` is learned
  const learnsTerm = learnsTermLanguage(course)
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

  const translationLabel = learnsTerm && details?.translations
    ? details.translations.join(', ')
    : word.translation
  // The native language reads as primary, the one being learned as secondary
  const primaryWord = learnsTerm ? translationLabel : word.term
  const secondaryWord = learnsTerm ? word.term : translationLabel

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-start gap-2.5 p-3.5">
        <button
          onClick={() => onToggleFavorite(word.id)}
          aria-label={word.favorite ? t.removeFavorite(word.term) : t.addFavorite(word.term)}
          aria-pressed={word.favorite}
          className="pressable mt-0.5 shrink-0 rounded-lg p-1"
        >
          <Star size={17} className={word.favorite ? 'fill-accent text-accent' : 'text-muted-foreground'} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {showRank && word.frequencyRank !== null && (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                #{word.frequencyRank}
              </span>
            )}
            <p className="min-w-0 truncate font-display text-[17px] font-semibold tracking-tight">
              {primaryWord}
            </p>
          </div>
          {/* Inflected forms belong to the `term` side — shown wherever it sits */}
          {!learnsTerm && forms && <p className="truncate text-xs text-muted-foreground/80">({forms})</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            {secondaryWord}
            {learnsTerm && forms && <span className="ml-1 text-xs opacity-70">({forms})</span>}
          </p>
          {learnsTerm && details?.context && (
            <p className="mt-1 text-xs italic text-muted-foreground">{details.context}</p>
          )}
          {details?.usage?.map(u => (
            <p key={u.term} className="mt-0.5 text-xs text-muted-foreground">
              <span className="text-foreground/80">{u.term}</span> — {u.translation}
            </p>
          ))}
          <LevelDots level={word.level} total={MAX_KNOWLEDGE_LEVEL} className="mt-2" />
        </div>

        {word.hasExamples && (
          <button
            onClick={toggleExamples}
            aria-expanded={showExamples}
            aria-label={t.examplesFor(word.term)}
            className={cn(
              'pressable mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border',
              showExamples
                ? 'border-primary/40 bg-info-soft text-primary'
                : 'border-border bg-surface text-muted-foreground',
            )}
          >
            <MessageSquare size={16} />
          </button>
        )}
      </div>

      {showExamples && (
        <div className="animate-rise space-y-2.5 border-t border-border bg-surface/60 px-3.5 py-3">
          {examples === null ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : examples.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            examples.map(ex => (
              <div key={ex.term}>
                <p className="text-sm leading-snug text-foreground">{ex.term}</p>
                {ex.translation && (
                  <p className="text-xs italic leading-snug text-muted-foreground">{ex.translation}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
