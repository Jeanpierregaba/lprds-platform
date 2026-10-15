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

function mkCaches() {
  const stores = new Map()
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url)
  const open = async (name) => {
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
function load(device, cookie = null) {
  const listeners = new Map()
  const caches = mkCaches()
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
    URL, Promise, console,
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), ctx)
  const waits = []
  const fire = async (ev, data) => {
    const fn = listeners.get(ev)
    const event = { ...data, waitUntil: (p) => waits.push(p), respondWith: (p) => { event._res = p } }
    fn(event)
    await Promise.all(waits.splice(0))
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

const failed = results.filter((r) => !r).length
console.log(failed === 0
  ? `\n✓ sw.js — ${results.length} contrôles de cache OK`
  : `\n✗ sw.js — ${failed} contrôle(s) de cache en échec`)
process.exit(results.every(Boolean) ? 0 : 1)
