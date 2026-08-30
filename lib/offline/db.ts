// The phone's own copy of what the app needs without a network: a pool of
// exercises downloaded in advance, the answers waiting to be sent, and the
// vocabulary list.
//
// IndexedDB rather than localStorage: the vocabulary of a pair is several
// megabytes of JSON, well past the ~5 MB localStorage ceiling, and writing it
// there would block the main thread on every save.
//
// No library. The three operations used here — put, getAll, delete — are a few
// lines each against the raw API, and a dependency that ships its own schema
// migrations would outweigh them.
const DB_NAME = 'svenska-offline'
const DB_VERSION = 1

export const STORES = {
  /** Exercises downloaded ahead of time, keyed by an incrementing id. */
  pool: 'pool',
  /** Answers given offline, waiting for the server. */
  queue: 'queue',
  /** The vocabulary list, one row per pair. */
  words: 'words',
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      // `pool` and `queue` are lists, `words` is keyed by pair
      if (!db.objectStoreNames.contains(STORES.pool)) {
        db.createObjectStore(STORES.pool, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORES.queue)) {
        db.createObjectStore(STORES.queue, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORES.words)) {
        db.createObjectStore(STORES.words, { keyPath: 'pair' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = action(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        transaction.oncomplete = () => db.close()
      }),
  )
}

/** Private browsing and old browsers have no IndexedDB — the app must still run. */
export function offlineStorageAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

export async function putAll<T>(store: StoreName, rows: T[]): Promise<void> {
  if (rows.length === 0) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    const target = transaction.objectStore(store)
    for (const row of rows) target.put(row)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', s => s.getAll() as IDBRequest<T[]>)
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', s => s.get(key) as IDBRequest<T | undefined>)
}

export async function remove(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    const target = transaction.objectStore(store)
    for (const key of keys) target.delete(key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function clear(store: StoreName): Promise<void> {
  await run(store, 'readwrite', s => s.clear())
}

export async function count(store: StoreName): Promise<number> {
  return run<number>(store, 'readonly', s => s.count())
}
