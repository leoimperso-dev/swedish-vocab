// App-shell cache: Next.js hashed static assets are immutable → cache-first.
// Pages and APIs stay network-only (auth + freshness).
const STATIC_CACHE = 'static-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const isImmutable = url.origin === location.origin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-'))
  if (!isImmutable) return

  event.respondWith(
    caches.open(STATIC_CACHE).then(async cache => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })
  )
})
