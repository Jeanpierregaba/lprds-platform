/* LPRDS — Service Worker (PWA app shell + vitrine).
 *
 * Stratégies (documentées dans CLAUDE.md, section PWA) :
 *  - Install  : précache le shell (page hors-ligne, manifest, icônes, accueil).
 *  - Navigate  : network-first, repli sur le HTML en cache puis /offline.
 *  - /_next/static, /icons, /images : stale-while-revalidate / cache-first.
 *  - /api/*    : jamais caché (données authentifiées, sensibles RGPD).
 *  - /version.json : jamais caché (sonde réseau de l'auto-update PWA —
 *    le client y lit la version du déploiement courant).
 *
 * ⚠️ Incrémenter CACHE_VERSION à chaque changement de stratégie ou d'assets
 * pré-cachés, sinon les clients gardent l'ancienne version de ce worker.
 */

const CACHE_VERSION = '2026.10'
const SHELL = 'lprds-shell@' + CACHE_VERSION

const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  const title = data.title || 'Nouvelle notification'
  const body = data.body || ''
  const icon = data.icon || '/icons/icon-192.png'
  const tag = data.tag || 'lprds-notification'

  const options = {
    body,
    icon,
    tag,
    vibrate: [200, 100, 200],
    data,
  }

  event.waitUntil(
    self.registration.showNotification(title, options),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      const matchingClient = windowClients.find(
        (client) => client.url.startsWith('/') && !client.closed,
      )

      if (matchingClient) {
        matchingClient.focus()
      } else if (clients.openWindow) {
        clients.openWindow('/')
      }
    }),
  )
})

function cacheFirst(event, cacheName = SHELL) {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone()
          caches.open(cacheName).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
    }),
  )
}

function staleWhileRevalidate(event, cacheName = SHELL) {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone()
            caches.open(cacheName).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // API : jamais de cache (données authentifiées). WebSocket etc. ne passent pas ici.
  if (url.pathname.startsWith('/api/')) return

  // Sonde de version (auto-update PWA) : toujours le réseau, jamais le cache —
  // sinon le sondage périodique lirait une version périmée via stale-while-revalidate.
  if (url.pathname === '/version.json') return

  // Navigation (pages) : network-first, repli HTML -> /offline.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone()
            caches.open(SHELL).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/'))
            .then((fallback) => fallback || caches.match('/offline')),
        ),
    )
    return
  }

  // Assets Next.js (chunks hashed) + fichiers public statiques.
  if (url.pathname.startsWith('/_next/static/')) {
    staleWhileRevalidate(event)
    return
  }
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/')) {
    cacheFirst(event)
    return
  }

  // Autre même-origine GET non-HTML : stale-while-revalidate prudent.
  staleWhileRevalidate(event)
})