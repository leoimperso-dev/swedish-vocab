// The vocabulary list, kept on the device.
//
// It was held in sessionStorage: gone as soon as the tab closed, and capped
// around 5 MB — a pair is 10 000 to 15 000 entries with their forms and
// details, which is already close. Here it survives the app being closed, so
// looking a word up needs no network at all.
import { STORES, get, offlineStorageAvailable, putAll } from '@/lib/offline/db'

interface CachedList<T> {
  pair: string
  words: T[]
  savedAt: number
}

export async function getCachedWords<T>(pair: string): Promise<T[] | null> {
  if (!offlineStorageAvailable()) return null
  const row = await get<CachedList<T>>(STORES.words, pair)
  return row?.words ?? null
}

/**
 * Stores the list, or rewrites it through `update` — used when a local action
 * (marking words as known) has already changed what the screen shows and the
 * cached copy would otherwise contradict it on the next visit.
 */
export async function cacheWords<T>(
  pair: string,
  wordsOrUpdate: T[] | ((current: T[]) => T[]),
): Promise<void> {
  if (!offlineStorageAvailable()) return
  let words: T[]
  if (typeof wordsOrUpdate === 'function') {
    const current = await getCachedWords<T>(pair)
    if (!current) return
    words = (wordsOrUpdate as (current: T[]) => T[])(current)
  } else {
    words = wordsOrUpdate
  }
  await putAll<CachedList<T>>(STORES.words, [{ pair, words, savedAt: Date.now() }])
}
