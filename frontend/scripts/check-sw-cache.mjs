/* Garde — stratégies de cache du service worker, rejouées hors navigateur.
 *
 * `public/sw.js` n'est couvert ni par `tsc` ni par ESLint, et ses défauts sont
 * tous SILENCIEUX : la page s'affiche, simplement dans la mauvaise langue ou
 * avec un contenu qui aurait dû disparaître. Les trois qui ont réellement
 * existé en sont la démonstration — la page hors-ligne anglaise stockée sous la
 * clé française, l'espace connecté qui restait sur le disque après
 * déconnexion, et l'accueil qui suivait la langue de l'APPAREIL et non celle
 * de l'utilisateur. Aucun n'aurait été vu sans ouvrir un vrai navigateur hors
 * ligne, dans la bonne langue, au bon moment.
 *
 * On charge donc le VRAI fichier dans un contexte minimal (`caches`, `fetch`,
 * `self`) avec un `fetch` qui imite le middleware — matcher et redirection de
 * langue comprises — et on vérifie ce que le worker met en cache, sous quelle
 * clé, et ce qu'il sert hors ligne.
 *
 * ⚠️ Le `fetch` simulé doit rester le miroir de `src/proxy.ts` : c'est lui
 * qui décide des redirections, donc de tout ce qui est vérifié ici. Sa
 * première version redirigeait `/icons/...`, que le matcher réel exclut — la
 * garde accusait alors le worker à tort.
 *
 * Lancé par `pnpm lint`. Les cinq contrôles ont été prouvés par sabotage : le
 * précache qui regrave une redirection, la navigation qui fait de même à
 * l'exécution, le réalignement de langue désactivé, la purge trop large et la
 * purge inopérante sont tous détectés.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const ORIGIN = 'https://lprds.test'

function mkResponse({ body, type = 'text/html', redirected = false, url, ok = true }) {
  return {
    ok, status: ok ? 200 : 404, redirected, url,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
    _body: body,
    clone() { return mkResponse({ body, type, redirected, url, ok }) },
  }
}

function mkCaches({ lent = false } = {}) {
  const stores = new Map()
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url)
  const open = async (name) => {
    // Une écriture en cache est une vraie E/S : en mode `lent`, elle coûte un
    // tour de boucle d'événements. Une écriture SUIVIE par `waitUntil` est
    // attendue malgré ça ; une écriture flottante, non — exactement ce que
    // fait Safari en fermant le worker dès la réponse rendue.
    if (lent) await new Promise((r) => setTimeout(r, 0))
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)
    return {
      put: async (req, res) => { m.set(keyOf(req), res) },
      match: async (req) => m.get(keyOf(req)),
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (req) => m.delete(keyOf(req)),
      addAll: async (urls) => { throw new Error('addAll ne doit plus etre utilise') },
    }
  }
  return {
    _stores: stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req) => {
      for (const m of stores.values()) { const hit = m.get(keyOf(req)); if (hit) return hit }
      return undefined
    },
  }
}

/* Appareil : 'fr' sert le francais a la racine, 'en' redirige / -> /en. */
function load(device, cookie = null, { lent = false } = {}) {
  const listeners = new Map()
  const caches = mkCaches({ lent })
  const fetchImpl = async (input) => {
    const href = typeof input === 'string' ? new URL(input, ORIGIN).href : input.url
    const path = new URL(href).pathname
    const unprefixed = !(path === '/en' || path.startsWith('/en/'))
    // Mirroir du matcher reel de src/proxy.ts : ces chemins ne passent
    // JAMAIS par le middleware, donc jamais par la detection de langue.
    const OUT_OF_MATCHER = /^\/(_next\/static|_next\/image|favicon\.ico|icons|images|public|api|manifest\.webmanifest|sw\.js|version\.json|sitemap\.xml|robots\.txt)/
    // /offline passe par le middleware mais est exemptee de la redirection.
    const exempt = path === '/offline' || OUT_OF_MATCHER.test(path)
    // Middleware : une URL sans prefixe est redirigee vers /en sur un appareil
    // anglophone, sauf /offline (exemptee de la detection).
    // Le cookie de langue prime sur la langue de l'appareil (middleware).
    const resolved = cookie || device
    if (resolved === 'en' && unprefixed && !exempt) {
      const target = path === '/' ? '/en' : `/en${path}`
      return mkResponse({ body: `${target}:en`, redirected: true, url: new URL(target, ORIGIN).href })
    }
    const lang = path === '/en' || path.startsWith('/en/') ? 'en' : 'fr'
    const type = /\.(png|jpg)$/.test(path) ? 'image/png'
      : path.endsWith('webmanifest') ? 'application/manifest+json' : 'text/html'
    return mkResponse({ body: `${path}:${lang}`, url: href, type })
  }
  const ctx = {
    self: {
      addEventListener: (ev, fn) => listeners.set(ev, fn),
      skipWaiting: () => {},
      clients: { claim: async () => {}, matchAll: async () => [] },
      location: { origin: ORIGIN },
      registration: { showNotification: async () => {} },
    },
    caches, fetch: fetchImpl, clients: { matchAll: async () => [] },
    // Le worker fabrique une réponse de dernier recours : sans ce global, il
    // lèverait ReferenceError au lieu d'être jugé sur son comportement.
    Response,
    URL, Promise, console,
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), ctx)
  const waits = []
  const fire = async (ev, data) => {
    const fn = listeners.get(ev)
    // `_active` reproduit la règle du navigateur : `waitUntil` n'est permis
    // que tant que l'événement l'est. Posé trop tard, il lève
    // `InvalidStateError` — un défaut que seul un vrai navigateur montrait.
    let enCours = 0
    const event = {
      ...data,
      _active: true,
      _tardif: false,
      waitUntil: (p) => {
        // Règle du navigateur : l'événement reste actif tant que `respondWith`
        // n'a pas abouti OU qu'une promesse de `waitUntil` est en cours. Passé
        // ce point, l'appel lève `InvalidStateError` — et le travail de fond
        // n'est plus garanti de s'achever.
        if (!event._active) { event._tardif = true; return }
        enCours += 1
        waits.push(Promise.resolve(p).finally(() => { enCours -= 1 }))
      },
      respondWith: (p) => { event._res = p },
    }
    fn(event)
    // La réponse d'abord : les écritures en cache sont posées DANS sa chaîne.
    if (event._res) { try { await event._res } catch { /* jugé par l'appelant */ } }
    while (waits.length) await Promise.all(waits.splice(0))
    if (enCours === 0) event._active = false
    return event
  }
  return { ctx, caches, fire, listeners }
}

async function navigateOnline(env, path) {
  const req = { url: new URL(path, ORIGIN).href, method: 'GET', mode: 'navigate', headers: { get: () => 'text/html' } }
  const ev = await env.fire('fetch', { request: req })
  const res = await ev._res
  await new Promise((r) => setImmediate(r))
  return res?._body
}

const results = []
const ck = (label, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  results.push(ok)
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`}`)
}

async function navigate(env, path) {
  const req = { url: new URL(path, ORIGIN).href, method: 'GET', mode: 'navigate', headers: { get: () => 'text/html' } }
  // Hors ligne : le reseau echoue.
  env.ctx.fetch = async () => { throw new Error('offline') }
  const ev = await env.fire('fetch', { request: req })
  const res = await ev._res
  env.ctx.fetch = undefined
  return res?._body
}

// ---- 1. Appareil FRANCOPHONE
{
  const env = load('fr')
  await env.fire('install', {})
  const shell = [...env.caches._stores.values()][0]
  const paths = [...shell.keys()].map((u) => new URL(u).pathname).sort()
  ck('fr : / est precache', paths.includes('/'), true)
  ck('fr : /en precache aussi', paths.includes('/en'), true)
  ck('fr : /offline en francais', (await shell.get(new URL('/offline', ORIGIN).href))._body, '/offline:fr')
  ck('fr : repli hors ligne de la racine = francais', await navigate(env, '/'), '/:fr')
  ck('fr : repli d\'une page inconnue = accueil fr', await navigate(env, '/galerie'), '/:fr')
  ck('fr : repli d\'une page /en inconnue = accueil en', await navigate(env, '/en/gallery'), '/en:en')
}

// ---- 2. Appareil ANGLOPHONE (le cas du bug)
{
  const env = load('en')
  await env.fire('install', {})
  const shell = [...env.caches._stores.values()][0]
  const paths = [...shell.keys()].map((u) => new URL(u).pathname).sort()
  ck('en : / n\'est PAS precache (il redirige)', paths.includes('/'), false)
  ck('en : /en precache', paths.includes('/en'), true)
  ck('en : /offline exempte, donc en francais', (await shell.get(new URL('/offline', ORIGIN).href))._body, '/offline:fr')
  ck('en : /en/offline en anglais', (await shell.get(new URL('/en/offline', ORIGIN).href))._body, '/en/offline:en')
  ck('en : repli hors ligne de la racine = ANGLAIS', await navigate(env, '/'), '/en:en')
  ck('en : icone precachee', paths.includes('/icons/icon-192.png'), true)
}

// ---- 3. Purge de fin de session
{
  const env = load('fr')
  await env.fire('install', {})
  const shell = [...env.caches._stores.values()][0]
  const put = (p, type) => shell.set(new URL(p, ORIGIN).href, mkResponse({ body: p, type, url: new URL(p, ORIGIN).href }))
  put('/galerie', 'text/html; charset=utf-8')
  put('/actualites?_rsc=abc', 'text/x-component')
  put('/_next/static/chunks/main.js', 'application/javascript')
  await env.fire('message', { data: { type: 'session-ended' } })
  const left = [...shell.keys()].map((u) => new URL(u).pathname + new URL(u).search).sort()
  ck('purge : page visitee retiree', left.includes('/galerie'), false)
  ck('purge : charge RSC retiree', left.includes('/actualites?_rsc=abc'), false)
  ck('purge : page hors-ligne CONSERVEE', left.includes('/offline'), true)
  ck('purge : /en/offline CONSERVEE', left.includes('/en/offline'), true)
  ck('purge : accueil precache CONSERVE', left.includes('/'), true)
  ck('purge : chunk statique CONSERVE', left.includes('/_next/static/chunks/main.js'), true)
}

// ---- 4. Execution : une navigation redirigee ne grave rien sous `/`
{
  const env = load('en')
  await env.fire('install', {})
  const shell = [...env.caches._stores.values()][0]
  ck('en : la navigation sur / sert bien la page', await navigateOnline(env, '/'), '/en:en')
  ck('en : ... sans la graver sous la cle francaise', shell.has(new URL('/', ORIGIN).href), false)
  ck('fr-path : /galerie mis en cache normalement',
     (await navigateOnline(env, '/en/gallery'), shell.has(new URL('/en/gallery', ORIGIN).href)), true)
}

// ---- 5. LE SCENARIO DE LA PLAINTE : francophone sur appareil anglophone
{
  const env = load('en')                       // appareil anglophone
  await env.fire('install', {})
  const shell = [...env.caches._stores.values()][0]
  ck('avant choix : accueil hors ligne en anglais', await navigate(env, '/'), '/en:en')

  // L'utilisateur choisit le francais : le cookie est pose, puis la page
  // rendue en francais previent le worker.
  const env2 = load('en', 'fr')
  env2.caches._stores.set([...env.caches._stores.keys()][0], shell)
  await env2.fire('message', { data: { type: 'locale-changed', locale: 'fr' } })
  ck('apres choix FR : accueil hors ligne en FRANCAIS', await navigate(env2, '/'), '/:fr')

  // Et l'inverse : retour a l'anglais sur un appareil francophone.
  const env3 = load('fr', 'en')
  env3.caches._stores.set([...env2.caches._stores.keys()][0], shell)
  await env3.fire('message', { data: { type: 'locale-changed', locale: 'en' } })
  ck('apres choix EN : accueil hors ligne en ANGLAIS', await navigate(env3, '/'), '/en:en')
}

// ---- 6. Le realignement ne coute pas un appel reseau quand c'est inutile
{
  const env = load('fr')
  await env.fire('install', {})
  let calls = 0
  const real = env.ctx.fetch
  env.ctx.fetch = async (...a) => { calls += 1; return real(...a) }
  await env.fire('message', { data: { type: 'locale-changed', locale: 'fr' } })
  ck('fr deja aligne : aucun appel reseau', calls, 0)
}

// ---- 7. Safari : `respondWith` ne doit JAMAIS recevoir autre chose qu'une Response
//
// Signalé par un établissement, sur un MacBook : « Safari ne parvient pas à
// ouvrir la page — Service Worker context closed ». Quatre chemins pouvaient
// résoudre `respondWith` sur `undefined`, tous quand le cache est VIDE et le
// réseau absent — c'est-à-dire exactement un worker installé de frais dont le
// précache a été interrompu, ce que Safari fait volontiers en tuant le worker.
// Chrome rend alors une erreur réseau sur la seule ressource ; Safari casse la
// navigation entière, et c'est ce que l'utilisateur lit.
{
  const estUneReponse = (r) => !!r && typeof r === 'object' && typeof r.status === 'number'

  const sansRien = (chemin, mode, accept) => {
    // Aucun `install` : le cache est vide. Et le réseau est coupé.
    const env = load('fr')
    env.ctx.fetch = async () => { throw new Error('offline') }
    return env.fire('fetch', {
      request: {
        url: new URL(chemin, ORIGIN).href,
        method: 'GET',
        mode,
        headers: { get: () => accept },
      },
    })
  }

  for (const [libelle, chemin, mode, accept] of [
    ['navigation publique', '/a-propos', 'navigate', 'text/html'],
    ['navigation de l\'espace connecté', '/dashboard/admin', 'navigate', 'text/html'],
    ['icône (cache-first)', '/icons/icon-192.png', 'no-cors', 'image/png'],
    ['chunk (stale-while-revalidate)', '/_next/static/chunk.js', 'no-cors', '*/*'],
  ]) {
    const ev = await sansRien(chemin, mode, accept)
    let rendu
    try { rendu = await ev._res } catch { rendu = undefined }
    ck(`cache vide + hors ligne : ${libelle} rend une Response`, estUneReponse(rendu), true)
  }
}

// ---- 8. Les écritures en cache sont SUIVIES par waitUntil
//
// Une promesse flottante survit à la réponse ; Safari ferme le worker dès
// celle-ci rendue, et l'écriture s'exécute dans un contexte mort — le message
// « Service Worker context closed ». Le cache est ici LENT (un vrai tour de
// boucle, comme une E/S) : seule une écriture attendue par l'événement a le
// temps d'atterrir.
{
  const env = load('fr', null, { lent: true })
  await env.fire('install', {})
  const req = {
    url: new URL('/nos-sections', ORIGIN).href,
    method: 'GET', mode: 'navigate', headers: { get: () => 'text/html' },
  }
  await env.fire('fetch', { request: req })   // aucun tour de boucle offert en plus
  const shell = [...env.caches._stores.values()][0]
  ck('navigation : l\'écriture en cache est attendue par l\'événement',
     [...shell.keys()].some((k) => k.includes('/nos-sections')), true)
}

// ---- 9. …et posées pendant que l'événement est encore ACTIF
//
// `waitUntil` appelé après la résolution de `respondWith` lève
// `InvalidStateError` : le travail de fond n'est alors plus garanti. Le piège
// vise `staleWhileRevalidate` sur un SUCCÈS DE CACHE — le cas courant : la
// réponse part aussitôt, la revalidation se termine bien plus tard. C'est
// pourquoi son `waitUntil` est posé SYNCHRONEMENT, avant `respondWith`.
{
  const env = load('fr', null, { lent: true })
  await env.fire('install', {})
  const url = new URL('/_next/static/chunk.js', ORIGIN).href
  const req = { url, method: 'GET', mode: 'no-cors', headers: { get: () => '*/*' } }
  await env.fire('fetch', { request: req })          // 1er passage : met en cache
  const ev = await env.fire('fetch', { request: req })  // 2e : succès de cache + revalidation
  // ⚠️ La revalidation se termine APRÈS la réponse — c'est tout le sujet. Lire
  // le drapeau tout de suite laisserait passer le défaut : il faut laisser le
  // second temps se produire, comme le navigateur le ferait.
  await new Promise((r) => setTimeout(r, 20))
  ck('revalidation : waitUntil posé pendant que l\'événement est actif', ev._tardif, false)
}

const failed = results.filter((r) => !r).length
console.log(failed === 0
  ? `\n✓ sw.js — ${results.length} contrôles de cache OK`
  : `\n✗ sw.js — ${failed} contrôle(s) de cache en échec`)
process.exit(results.every(Boolean) ? 0 : 1)
