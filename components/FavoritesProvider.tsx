'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// Favourites are starred from three places — the vocabulary list, a running
// exercise and the word popover of a story — so the set lives above all of
// them rather than in each page's own state, where the three would drift apart.
interface FavoritesValue {
  ids: Set<string>
  isFavorite: (wordId: string) => boolean
  toggle: (wordId: string) => void
}

const FavoritesContext = createContext<FavoritesValue>({
  ids: new Set(),
  isFavorite: () => false,
  toggle: () => {},
})

export function FavoritesProvider({ initial, children }: { initial: string[]; children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(() => new Set(initial))

  const toggle = useCallback((wordId: string) => {
    let next = false
    setIds(prev => {
      const copy = new Set(prev)
      next = !copy.has(wordId)
      if (next) copy.add(wordId)
      else copy.delete(wordId)
      return copy
    })
    fetch('/api/words/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordId, favorite: next }),
    }).catch(() => {
      // Put the star back where it was — the server never got the change
      setIds(prev => {
        const copy = new Set(prev)
        if (next) copy.delete(wordId)
        else copy.add(wordId)
        return copy
      })
    })
  }, [])

  return (
    <FavoritesContext.Provider value={{ ids, isFavorite: id => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  return useContext(FavoritesContext)
}
