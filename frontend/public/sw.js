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

const CACHE_VERSION = '2026.16'
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

/* Précache du shell — ⚠️ JAMAIS `cache.addAll` ici.
 *
 * `addAll` suit les redirections et stocke le RÉSULTAT sous l'URL DEMANDÉE.
 * C'est ainsi que `/offline` s'est retrouvé en anglais sous la clé française :
 * sur un appareil anglophone, le middleware redirigeait `/offline` vers
 * `/en/offline` PENDANT le précache. Cette page a pu être exemptée de la
 * détection de langue ; l'ACCUEIL, lui, ne peut pas l'être — c'est la
 * détection elle-même qu'il faudrait désactiver. On gravait donc l'accueil
 * ANGLAIS sous la clé `/`, et un francophone repassé en français lisait un
 * accueil anglais hors ligne.
 *
 * On ne précache donc que les réponses NON REDIRIGÉES. `/` n'est gardé que
 * sur les appareils où il sert réellement du français ; ailleurs il reste
 * absent, et le repli hors ligne de la racine passe par `/en`
 * (cf. `navigationFallback`) — c'est-à-dire exactement ce que le réseau
 * aurait servi à cet appareil.
 *
 * Conséquence : un fichier manquant ne fait plus échouer tout le précache,
 * contrairement à `addAll` qui rejette en bloc.
 */
async function precache() {
  const cache = await caches.open(SHELL)
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        // `cache: 'reload'` : on ne veut pas graver une réponse que le cache
        // HTTP du navigateur garderait d'un déploiement précédent.
        const response = await fetch(url, { cache: 'reload' })
        if (!response.ok || response.redirected) return
        await cache.put(url, response)
      } catch {
        // Hors ligne au moment de l'installation, ou asset absent.
      }
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
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
  /* ⚠️ Repli en NOM PROPRE, jamais en français.
   *
   * Le worker n'a pas de catalogue de traduction : toute phrase écrite ici
   * s'afficherait dans une seule langue, chez tout le monde. « Nouvelle
   * notification » arrivait donc tel quel sur un appareil anglophone. Le
   * backend rend déjà titre et corps dans la langue du DESTINATAIRE (cf.
   * notifications/service.py) ; ce repli ne sert qu'à une charge utile
   * malformée, et un nom propre est la seule chose qu'on puisse y mettre sans
   * choisir une langue à la place du lecteur. */
  const title = data.title || 'LPRDS'
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

/* Réponse de DERNIER recours.
 *
 * ⚠️ `respondWith()` qui reçoit `undefined` fait échouer la requête, et Safari
 * l'affiche à l'utilisateur comme une page qui ne s'ouvre pas. Trois chemins
 * pouvaient y aboutir : un repli de navigation qui ne trouve rien en cache,
 * un `cacheFirst` dont le réseau tombe, et un `staleWhileRevalidate` hors
 * ligne sur une ressource jamais vue. Chrome rend alors une erreur réseau
 * ordinaire pour cette seule ressource ; Safari casse la navigation entière.
 */
function unavailable() {
  return new Response('', { status: 503, statusText: 'Offline' })
}

function cacheFirst(event, cacheName = SHELL) {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone()
            // ⚠️ `waitUntil`, jamais une promesse flottante : sans lui, Safari
            // ferme le worker dès la réponse rendue et l'écriture en cours
            // s'exécute dans un contexte mort.
            event.waitUntil(caches.open(cacheName).then((cache) => cache.put(event.request, clone)))
          }
          return response
        })
        .catch(() => unavailable())
    }),
  )
}

function staleWhileRevalidate(event, cacheName = SHELL) {
  const request = event.request
  const network = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(cacheName)
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  // ⚠️ SYNCHRONE, pendant que l'événement est encore actif. Posé plus tard —
  // dans le `.then` de la revalidation, qui peut tourner après que la réponse
  // en cache a déjà été rendue — `waitUntil` lève `InvalidStateError` :
  // l'événement n'est plus actif. C'est le piège inverse de celui du
  // `cacheFirst` ci-dessus, où l'appel reste dans la chaîne de `respondWith`.
  event.waitUntil(network)

  event.respondWith(
    caches.match(request).then((cached) => cached || network.then((r) => r || unavailable())),
  )
}

/* Repli hors ligne d'une navigation.
 *
 * La langue suit l'URL DEMANDÉE, jamais celle du navigateur — `/en/...`
 * retombe sur la page hors-ligne anglaise, le reste sur la française (le
 * français n'a pas de préfixe, cf. localePrefix 'as-needed').
 *
 * ⚠️ La RACINE est le seul cas où l'URL ne dit rien : `/` sert du français ou
 * de l'anglais selon l'appareil. On le déduit du précache plutôt que de le
 * deviner — si `/` est en cache, c'est que cet appareil reçoit bien du
 * français à la racine (aucune redirection n'a eu lieu à l'installation) ; son
 * absence signifie que `/` redirige vers `/en`, et le repli anglais est alors
 * la réponse JUSTE : c'est celle que le réseau aurait donnée.
 */
async function navigationFallback(request, pathname) {
  const exact = await caches.match(request)
  if (exact) return exact

  // `/` tombe ici avec le reste : son absence du cache ci-dessus EST le signal
  // que cet appareil est servi en anglais à la racine.
  if (pathname === '/' || pathname === '/en' || pathname.startsWith('/en/')) {
    return (await caches.match('/en')) || (await caches.match('/en/offline')) || unavailable()
  }
  return (await caches.match('/')) || (await caches.match('/offline')) || unavailable()
}

/* Fin de session — purge des PAGES mises en cache.
 *
 * Rien ne nettoyait les caches à la déconnexion. Depuis que l'espace connecté
 * n'est plus mis en cache du tout, le risque est résiduel (il ne reste que des
 * pages publiques), mais sur un appareil partagé la ceinture et les bretelles
 * ne coûtent rien.
 *
 * ⚠️ On ne vide PAS le cache en entier. Le shell (page hors-ligne, icônes,
 * accueil) n'est précaché qu'à l'INSTALLATION du worker : le supprimer ici
 * laisserait l'appareil sans repli hors ligne jusqu'au prochain changement de
 * `CACHE_VERSION` — c'est-à-dire longtemps. On ne retire donc que les PAGES
 * visitées (documents HTML et charges RSC), en gardant les URL précachées et
 * les assets statiques, qui ne portent rien de personnel.
 */
async function purgeVisitedPages() {
  const cache = await caches.open(SHELL)
  const keys = await cache.keys()
  await Promise.all(
    keys.map(async (request) => {
      const url = new URL(request.url)
      if (PRECACHE_URLS.includes(url.pathname)) return
      const cached = await cache.match(request)
      const type = cached?.headers.get('content-type') || ''
      // `text/x-component` = charge RSC, qui porte des données rendues côté
      // serveur ; `text/html` = la page elle-même.
      if (type.includes('text/html') || type.includes('text/x-component')) {
        await cache.delete(request)
      }
    }),
  )
}

/* Accueil précaché — aligné sur le choix de langue de l'utilisateur.
 *
 * La page hors-ligne a pu être exemptée de la détection de langue ; l'accueil
 * ne peut pas l'être, c'est la détection même qu'il faudrait couper. Hors
 * ligne, un francophone sur un appareil anglophone voyait donc l'accueil en
 * anglais — et ça ne se corrigeait jamais tout seul.
 *
 * On ne touche pas à la détection : on REJOUE le précache de l'accueil quand
 * la langue choisie change (la page nous le dit, cf. `notifyLocaleChanged`).
 * Le cookie de langue est alors posé, donc `/` sert enfin le français et
 * n'est plus redirigé.
 *
 * Idempotent et quasi gratuit : appelé à chaque chargement de page, il ne fait
 * un appel réseau que si le cache n'est pas déjà dans l'état voulu.
 */
async function alignHomeCache(locale) {
  const cache = await caches.open(SHELL)

  if (locale !== 'fr') {
    // L'anglais a sa propre clé (`/en`). Garder une entrée sous `/` ne
    // pourrait plus que servir du français à qui a choisi l'anglais.
    await cache.delete('/')
    return
  }

  if (await cache.match('/')) return

  try {
    const response = await fetch('/', { cache: 'reload' })
    if (response.ok && !response.redirected) await cache.put('/', response)
  } catch {
    // Hors ligne : on réessaiera au prochain chargement.
  }
}

self.addEventListener('message', (event) => {
  const data = event.data
  if (data?.type === 'session-ended') {
    event.waitUntil(purgeVisitedPages())
    return
  }
  if (data?.type === 'locale-changed') {
    event.waitUntil(alignHomeCache(data.locale))
  }
})

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
      event.respondWith(
        fetch(request).catch(async () => (await caches.match(offlinePage)) || unavailable()),
      )
    }
    return
  }

  // Navigation (pages) : network-first, repli HTML -> /offline.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // ⚠️ `response.redirected` : même piège que le précache, mais à
          // l'EXÉCUTION. Un anglophone qui ouvre `/` est redirigé vers `/en`
          // par le middleware ; sans ce test, on graverait l'accueil ANGLAIS
          // sous la clé `/`, et un francophone sur le même appareil lirait
          // ensuite un accueil anglais hors ligne. La réponse est servie
          // normalement, elle n'est simplement pas mise en cache sous une clé
          // qui n'est pas la sienne — `/en` a la sienne.
          if (response && response.ok && !response.redirected) {
            const clone = response.clone()
            event.waitUntil(caches.open(SHELL).then((cache) => cache.put(request, clone)))
          }
          return response
        })
        .catch(() => navigationFallback(request, url.pathname)),
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