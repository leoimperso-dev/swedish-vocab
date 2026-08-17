'use client'

import { Star } from 'lucide-react'
import { useFavorites } from '@/components/FavoritesProvider'
import { useLang } from '@/components/CourseProvider'
import { getStrings } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Stars a word from anywhere it is shown — list row, exercise, story popover. */
export function FavoriteStar({ wordId, label, size = 17, className }: {
  wordId: string
  // The word itself, for the accessible name
  label: string
  size?: number
  className?: string
}) {
  const { isFavorite, toggle } = useFavorites()
  const t = getStrings(useLang())
  const on = isFavorite(wordId)

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        toggle(wordId)
      }}
      aria-label={on ? t.removeFavorite(label) : t.addFavorite(label)}
      aria-pressed={on}
      className={cn('pressable shrink-0 rounded-lg p-1', className)}
    >
      <Star size={size} className={on ? 'fill-accent text-accent' : 'text-muted-foreground'} />
    </button>
  )
}
