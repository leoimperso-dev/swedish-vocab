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
