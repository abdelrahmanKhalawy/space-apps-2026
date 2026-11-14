// AstroPulse service worker: the app opens and keeps showing the last data when the link drops.
//   page and /assets  -> network first for the page, cache first for hashed assets
//   /api (GET)        -> network first, falls back to the last good answer
// Writes (POST) are never cached here. The offline outbox (src/offline) keeps unsent readings.
const SHELL = 'astropulse-shell-v1'
const DATA = 'astropulse-data-v1'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch {
    return (await cache.match(request)) ?? (fallbackUrl ? await caches.match(fallbackUrl) : undefined) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) (await caches.open(SHELL)).put(request, res.clone())
  return res
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/hubs/')) return // live socket: never cached
  if (url.pathname.startsWith('/api/demo')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/'))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA))
  }
})
