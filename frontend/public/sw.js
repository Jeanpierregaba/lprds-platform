/* LPRDS — Service Worker (PWA app shell + vitrine).
 *
 * Stratégies (documentées dans CLAUDE.md, section PWA) :
 *  - Install  : précache le shell (page hors-ligne, manifest, icônes, accueil).
 *  - Navigate  : network-first, repli sur le HTML en cache puis /offline
 *                (ou /en/offline — le repli suit la langue de l'URL demandée).
 *  - /_next/static, /icons, /images : stale-while-revalidate / cache-first.
 *  - /api/*    : jamais caché (données authentifiées, sensibles RGPD).
 *  - /version.json : jamais caché (sonde réseau de l'auto-update PWA —
 *    le client y lit la version du déploiement courant).
 *
 * ⚠️ Incrémenter CACHE_VERSION à chaque changement de stratégie ou d'assets
 * pré-cachés, sinon les clients gardent l'ancienne version de ce worker.
 */

const CACHE_VERSION = '2026.13'
const SHELL = 'lprds-shell@' + CACHE_VERSION

/* ⚠️ L'ESPACE CONNECTÉ N'EST JAMAIS MIS EN CACHE.
 *
 * Le commentaire d'en-tête annonçait « /api/* : jamais caché (données
 * authentifiées, sensibles RGPD) » — le principe était juste, l'application
 * incomplète. Seuls les APPELS d'API étaient épargnés : le HTML des pages du
 * tableau de bord passait par le gestionnaire de navigation, et leurs charges
 * RSC (`?_rsc=`, qui portent des données rendues côté serveur) tombaient dans
 * le filet final. Le dossier d'un enfant restait donc sur le disque, lisible
 * hors ligne, et survivait à la déconnexion — rien ne purge les caches à ce
 * moment-là. Sur un appareil partagé, c'est exactement ce qu'on ne veut pas.
 *
 * La règle reflète `PRIVATE_PREFIX` du middleware (`src/middleware.ts`) : les
 * deux doivent dire la même chose. Conséquence assumée : une page de
 * l'espace connecté demandée hors ligne retombe sur /offline au lieu d'un
 * écran périmé — pour des données d'enfants, c'est la bonne réponse.
 */
function isPrivate(pathname) {
  return pathname === '/dashboard'
    || pathname.startsWith('/dashboard/')
    || pathname === '/en/dashboard'
    || pathname.startsWith('/en/dashboard/')
}

const PRECACHE_URLS = [
  '/',
  '/en',
  // Les deux langues de la page hors-ligne : sans `/en/offline`, un visiteur
  // anglophone coupé du réseau tomberait sur la version française.
  '/offline',
  '/en/offline',
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

/* Tapotement sur une notification.
 *
 * ⚠️ Deux défauts cumulés, et aucun ne se voyait :
 *
 * 1. La destination était IGNORÉE : on ouvrait toujours `/`. Un parent qui
 *    tapotait « rapport validé » arrivait sur son accueil et devait retrouver
 *    le rapport à la main — un clic perdu à chaque notification. Le backend
 *    joint désormais `data.url` (cf. `app/core/links.py`).
 *
 * 2. La recherche d'un onglet déjà ouvert testait `client.url.startsWith('/')`.
 *    Or `client.url` est une URL ABSOLUE (`https://hôte/chemin`) : le test
 *    était toujours faux, donc la branche « ramener l'onglet existant au
 *    premier plan » ne s'exécutait jamais et une fenêtre neuve s'ouvrait à
 *    chaque fois. (`client.closed` n'existe pas non plus sur un WindowClient.)
 *    On compare donc les ORIGINES, et on fait naviguer l'onglet retrouvé
 *    jusqu'à la bonne page.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // Résolue contre NOTRE origine, et refusée si elle en sort : le contenu
  // d'un push ne doit jamais pouvoir ouvrir un site tiers.
  let target
  try {
    target = new URL(event.notification.data?.url || '/', self.location.origin)
  } catch {
    target = new URL('/', self.location.origin)
  }
  if (target.origin !== self.location.origin) {
    target = new URL('/', self.location.origin)
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin
        } catch {
          return false
        }
      })

      if (existing) {
        // Ramener au premier plan NE SUFFIT PAS : l'onglet peut être sur une
        // tout autre page que celle qu'annonce la notification.
        const focused = existing.focus()
        if ('navigate' in existing) {
          return Promise.resolve(focused).then(() => existing.navigate(target.href))
        }
        return focused
      }
      return clients.openWindow ? clients.openWindow(target.href) : undefined
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

  // Espace connecté : ni mis en cache, ni servi depuis le cache. Une
  // navigation hors ligne y retombera sur /offline par le gestionnaire
  // ci-dessous ; une charge RSC échouera, ce qui est le comportement juste.
  if (isPrivate(url.pathname)) {
    if (request.mode === 'navigate') {
      const offlinePage = url.pathname.startsWith('/en/') ? '/en/offline' : '/offline'
      event.respondWith(fetch(request).catch(() => caches.match(offlinePage)))
    }
    return
  }

  // Navigation (pages) : network-first, repli HTML -> /offline.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    // Le repli suit la langue du chemin demandé : `/en/...` retombe sur la
    // page hors-ligne anglaise, tout le reste sur la française (le français
    // n'a pas de préfixe — cf. localePrefix 'as-needed').
    const isEnglish = url.pathname === '/en' || url.pathname.startsWith('/en/')
    const home = isEnglish ? '/en' : '/'
    const offline = isEnglish ? '/en/offline' : '/offline'
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
            .then((cached) => cached || caches.match(home))
            .then((fallback) => fallback || caches.match(offline)),
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