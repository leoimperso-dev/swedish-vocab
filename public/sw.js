// App-shell cache: Next.js hashed static assets are immutable → cache-first.
// APIs stay network-only (auth + freshness); pages are network-first with a
// cached copy behind them, which is what lets the app open with no network.
const STATIC_CACHE = 'static-v1'
const PAGE_CACHE = 'pages-v4'

// Pages worth keeping for offline use. The rest of the app needs the server
// anyway — a duel is an exchange with an opponent, statistics are computed in
// the database — so caching them would only show stale numbers.
//
// '/reading' covers the story index and every story under it: a story is a
// fixed text, so the copy cached on the way through stays correct. Only the
// stories actually opened online are kept — pre-fetching every one of them
// would download the whole library on a phone connection.
const OFFLINE_PAGES = ['/study', '/words', '/dashboard', '/reading']

self.addEventListener('install', event => {
  // Fetch the offline pages now rather than hope the learner visits each one
  // online first. Registration happens on an authenticated page, so these come
  // back as real pages and not as a redirect to /login.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PAGE_CACHE)
        await Promise.all(
          OFFLINE_PAGES.map(async path => {
            const response = await fetch(path, { credentials: 'same-origin' })
            if (response.ok && !response.redirected) await cache.put(location.origin + path, response)
          }),
        )
      } catch {
        // A failed pre-cache must not block the worker: the fetch handler still
        // fills the cache page by page as they are visited.
      }
      await self.skipWaiting()
    })()
  )
})

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

  // Pages: network first, cached copy behind. Two request shapes reach the same
  // page — the cold-start navigation, and the RSC payload the client router
  // fetches when a link is tapped inside the app. Both are cached under the
  // request URL, so a link works offline as well as a launch does.
  const isOfflinePage = OFFLINE_PAGES.some(
    path => url.pathname === path || url.pathname.startsWith(path + '/'),
  )
  const isNavigation = request.mode === 'navigate'
  const isRouterFetch = url.searchParams.has('_rsc')
  // A navigation anywhere is handled, so that opening the app offline lands on
  // the cached start page instead of the browser's error. Router fetches are
  // only cached for the pages meant to work offline.
  if (!isNavigation && !(isRouterFetch && isOfflinePage)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGE_CACHE)
      try {
        const response = await fetch(request)
        // A redirect is not a page: caching the one to /login would lock the
        // learner out on the next cold start, and a redirected response cannot
        // be replayed for a navigation anyway.
        if (response.ok && !response.redirected && isOfflinePage) {
          cache.put(request.url, response.clone())
        }
        return response
      } catch {
        // ignoreVary: Next varies its responses on RSC headers that differ from
        // one launch to the next, so an exact match would never hit.
        const exact = await cache.match(request.url, { ignoreVary: true })
        if (exact) return exact
        if (isNavigation) {
          const byPath = await cache.match(url.origin + url.pathname, { ignoreVary: true })
          if (byPath) return byPath
          // The home-screen shortcut may point at "/", which only redirects, and
          // a link may lead somewhere never cached. Falling back to the start
          // page beats a dead end — the learner lands in the app either way.
          const home = await cache.match(location.origin + '/dashboard', { ignoreVary: true })
          if (home) return home
          // Never throw out of respondWith: the browser turns that into a bare
          // "Failed to fetch" with no page at all. An honest message is better.
          return offlinePage()
        }
        // An RSC payload is cached under a hash that changes between builds, so
        // a miss is expected. Failing it makes the client router fall back to a
        // full navigation, which the branch above serves from the cache — the
        // page HTML must never be returned here, the router cannot parse it.
        return Response.error()
      }
    })()
  )
})

// Shown only when the page was never opened online, so nothing was cached.
function offlinePage() {
  return new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Hors ligne</title>
     <body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px">
       <div>
         <p style="font-size:18px;font-weight:600;margin:0 0 8px">Pas de connexion</p>
         <p style="font-size:14px;opacity:.75;margin:0">Ouvre l'application une fois connecté pour pouvoir l'utiliser hors ligne.</p>
       </div>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

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
