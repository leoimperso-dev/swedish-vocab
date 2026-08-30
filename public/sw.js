// App-shell cache: Next.js hashed static assets are immutable → cache-first.
// APIs stay network-only (auth + freshness); pages are network-first with a
// cached copy behind them, which is what lets the app open with no network.
const STATIC_CACHE = 'static-v1'
const PAGE_CACHE = 'pages-v1'

// Pages worth keeping for offline use. The rest of the app needs the server
// anyway — a duel is an exchange with an opponent, statistics are computed in
// the database — so caching them would only show stale numbers.
const OFFLINE_PAGES = ['/study', '/words', '/dashboard']

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  const keep = [STATIC_CACHE, PAGE_CACHE]
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return

  const isImmutable = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-')
  if (isImmutable) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // Page navigations: serve the network, keep a copy, and fall back to that copy
  // when there is none. The page is stale by definition — the header may show
  // yesterday's XP — but the study screen reads its exercises from IndexedDB,
  // so what matters is that the app opens at all.
  const isPage = request.mode === 'navigate' &&
    OFFLINE_PAGES.some(path => url.pathname === path || url.pathname.startsWith(path + '/'))
  if (!isPage) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGE_CACHE)
      try {
        const response = await fetch(request)
        // Only a real page is worth keeping: a redirect to /login cached here
        // would lock the learner out of the app the next time they open it
        if (response.ok && response.type === 'basic') cache.put(request, response.clone())
        return response
      } catch (error) {
        const cached = await cache.match(request) || await cache.match(url.pathname)
        if (cached) return cached
        throw error
      }
    })()
  )
})

// Duel notifications. The payload is written by lib/push.ts; a missing or
// malformed one still shows something rather than nothing.
self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const title = payload.title || 'Vocab'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag = the new notification replaces the old one instead of stacking
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/duels' },
    })
  )
})

// Focus an open tab rather than piling up new ones.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/duels', location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) return client.focus()
      }
      for (const client of clientList) {
        if ('navigate' in client) return client.navigate(target).then(c => c && c.focus())
      }
      return self.clients.openWindow(target)
    })
  )
})
