import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'

import { resolveLocale } from '@/i18n/detect'
import { hasLocalizedSlug, marketingPath, routePathFor } from '@/i18n/slugs'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isAppLocale,
  routing,
  type AppLocale,
} from '@/i18n/routing'
import { ROLE_HOME, type UserRole } from '@/types/auth'

/**
 * Middleware unique — il cumule trois responsabilités qui doivent s'exécuter
 * dans cet ordre précis :
 *   1. résoudre la langue (préfixe d'URL, cookie, langue du compte, puis
 *      `Accept-Language`) ;
 *   2. rediriger un visiteur non francophone arrivé sur une URL sans préfixe ;
 *   3. appliquer la garde d'authentification et de rôle, sur le chemin
 *      DÉBARRASSÉ de son préfixe de langue.
 *
 * L'étape 3 doit impérativement travailler sur le chemin nu : sans cela,
 * `/en/dashboard/admin` ne correspondrait à aucune règle et un visiteur
 * anglophone non connecté accéderait à l'espace d'administration.
 */

const intlMiddleware = createMiddleware(routing)

const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/reset-password',
  '/auth/new-password',
  // Repli hors-ligne du service worker : par définition atteinte sans réseau,
  // donc sans possibilité de valider une session.
  '/offline',
]

/**
 * Le seul espace réellement privé de l'application.
 *
 * ⚠️ La garde a longtemps raisonné à l'envers — « tout ce qui n'est pas listé
 * comme public est privé ». C'était juste pour les routes qui EXISTENT, et faux
 * pour toutes les autres : une URL inconnue n'étant dans aucune liste,
 * `/une-page-inconnue` redirigeait un visiteur anonyme vers l'écran de
 * connexion. Un moteur d'indexation y voyait une redirection, pas une page
 * disparue ; un visiteur suivant un vieux lien croyait avoir été déconnecté ;
 * et personne ne pouvait distinguer « cette adresse n'existe pas » de « cette
 * page est protégée », ce qui est exactement ce qu'une 404 doit dire.
 *
 * Nommer l'espace privé plutôt que d'énumérer le public remet le défaut du bon
 * côté : une URL inconnue traverse le middleware et Next.js rend sa 404.
 *
 * La contrepartie est qu'une future route privée posée AILLEURS que sous
 * `/dashboard` serait publique sans que rien ne le signale. C'est précisément
 * la classe de défaut silencieux que le projet refuse de laisser à la
 * vigilance : `scripts/check-private-routes.mjs` échoue si une route échappe à
 * la fois à ce préfixe et aux deux listes ci-dessus.
 */
const PRIVATE_PREFIX = '/dashboard'

// Site vitrine — accessible sans compte. La racine "/" est gérée séparément
// (cf. plus bas : un visiteur authentifié y est redirigé vers son espace,
// mais un visiteur anonyme doit pouvoir la consulter comme les autres pages
// marketing ci-dessous).
const MARKETING_ROUTES = [
  '/a-propos',
  '/nos-sections',
  '/galerie',
  '/actualites',
  '/contact',
  '/mentions-legales',
  '/confidentialite',
]

// Préfixe /dashboard/<segment> → rôle autorisé
const ROLE_BY_DASHBOARD_PREFIX: Record<string, UserRole> = {
  super:  'superadmin',
  admin:  'admin',
  staff:  'staff',
  parent: 'parent',
}

/** Chemin nu → chemin réellement servi pour cette langue.
 *  Le français est la locale par défaut en mode `as-needed` : il ne porte
 *  jamais de préfixe, et garde donc les URL historiques du projet. */
function localized(path: string, locale: AppLocale): string {
  const slug = marketingPath(path, locale)
  return locale === DEFAULT_LOCALE ? slug : `/${locale}${slug}`
}

/** Sépare un chemin en (langue explicite ou non, chemin nu). */
function splitLocale(pathname: string): { prefixed: boolean; bare: string } {
  const segments = pathname.split('/')
  const first = segments[1]

  if (!isAppLocale(first)) return { prefixed: false, bare: pathname }

  const rest = segments.slice(2).join('/')
  return { prefixed: true, bare: rest ? `/${rest}` : '/' }
}

/**
 * Session telle que le navigateur la persiste (store Zustand, cookie
 * `lprds-auth`). Tolérant par construction : un cookie absent, tronqué ou
 * d'une version antérieure du store ne doit jamais faire échouer le
 * middleware, qui garde alors l'utilisateur pour un visiteur anonyme.
 */
function readSession(request: NextRequest): {
  accessToken: string | null
  role: UserRole | null
  locale: string | null
} {
  const raw = request.cookies.get('lprds-auth')?.value
  if (!raw) return { accessToken: null, role: null, locale: null }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    return {
      accessToken: parsed?.state?.accessToken ?? null,
      role: parsed?.state?.user?.role ?? null,
      locale: parsed?.state?.user?.locale ?? null,
    }
  } catch {
    return { accessToken: null, role: null, locale: null }
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { prefixed, bare: servedPath } = splitLocale(pathname)

  // La session est lue AVANT la résolution de langue : le cookie `lprds-auth`
  // porte `user.locale`, qui doit pouvoir départager une URL sans préfixe.
  const session = readSession(request)

  // Une langue explicite dans l'URL fait toujours foi : elle exprime une
  // intention (lien partagé, favori, choix du sélecteur) et ne doit jamais
  // être écrasée par la préférence du navigateur.
  const localeFromUrl = prefixed ? (pathname.split('/')[1] as AppLocale) : null
  const locale: AppLocale = localeFromUrl
    ?? resolveLocale(
        request.cookies.get(LOCALE_COOKIE)?.value,
        request.headers.get('accept-language'),
        session.locale,
      )

  // Les pages publiques ont un slug par langue (`/en/about` ↔ `/a-propos`).
  // Tout le reste du middleware raisonne sur le chemin de la ROUTE — celui qui
  // existe sur le disque — et jamais sur le slug servi.
  const bare = routePathFor(servedPath, locale)

  // Détection automatique — un visiteur dont l'appareil n'est pas en français
  // et qui arrive sur une URL sans préfixe est envoyé vers sa version anglaise.
  // `next-intl` ne peut pas s'en charger : son repli natif ramènerait au
  // français toute langue qu'il ne reconnaît pas (cf. src/i18n/detect.ts).
  // ⚠️ La page hors-ligne échappe à la détection de langue.
  //
  // Le service worker PRÉCACHE les deux versions (`/offline` et `/en/offline`)
  // pour que chacun retrouve la sienne sans réseau. Mais sur un appareil
  // anglophone, `/offline` était redirigé vers `/en/offline` pendant le
  // précache : le contenu ANGLAIS se retrouvait stocké sous la clé FRANÇAISE,
  // et un utilisateur repassé en français lisait une page hors-ligne anglaise.
  // La langue de cette page doit donc suivre son URL, jamais le navigateur —
  // c'est le worker qui choisit la bonne clé au moment de servir.
  const isOfflinePage = bare === '/offline'

  if (!prefixed && locale !== DEFAULT_LOCALE && !isOfflinePage) {
    const url = request.nextUrl.clone()
    url.pathname = localized(pathname, locale)
    return NextResponse.redirect(url)
  }

  // Forme non canonique : `/en/a-propos` alors que l'anglais dit `/en/about`.
  // Redirection permanente plutôt que double service — deux URL pour une même
  // page, c'est du contenu dupliqué pour un moteur, et les balises `hreflang`
  // n'en désignent qu'une.
  if (prefixed && hasLocalizedSlug(servedPath, locale)) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${marketingPath(servedPath, locale)}`
    return NextResponse.redirect(url, 308)
  }

  const isMarketing = bare === '/' || MARKETING_ROUTES.some((r) => bare.startsWith(r))
  // Pages publiques CONNUES — à distinguer d'« inconnue ». Les deux étaient
  // confondues, d'où la redirection vers le login sur une URL qui n'existe pas.
  const isPublic = isMarketing || PUBLIC_ROUTES.some((r) => bare.startsWith(r))
  const isPrivate = bare === PRIVATE_PREFIX || bare.startsWith(`${PRIVATE_PREFIX}/`)

  const { accessToken, role } = session
  const isAuth = !!accessToken

  // Non-authentifié sur route privée → login.
  // Le test porte sur l'espace privé, jamais sur « absent des listes
  // publiques » : une URL inconnue doit tomber en 404, pas sur le login.
  if (!isAuth && isPrivate) {
    const url = request.nextUrl.clone()
    url.pathname = localized('/auth/login', locale)
    return NextResponse.redirect(url)
  }

  // Authentifié sur page auth ou marketing → accueil de son rôle.
  // Repli sur /auth/login (jamais '/', désormais public : un rôle absent
  // renverrait sinon en boucle vers cette même règle).
  //
  // Ici le test reste `isPublic`, et c'est voulu : une URL inconnue ne doit pas
  // davantage renvoyer un utilisateur connecté vers son tableau de bord — elle
  // n'existe pour personne.
  if (isAuth && isPublic && bare !== '/auth/new-password') {
    const url = request.nextUrl.clone()
    url.pathname = localized(role ? ROLE_HOME[role] : '/auth/login', locale)
    return NextResponse.redirect(url)
  }

  // Garde par rôle sur /dashboard/<segment>/...
  // Exception : le staff réutilise les pages /dashboard/admin/* (RBAC dynamique,
  // cf. claude.md) — le contrôle réel se fait côté backend par permission, pas ici.
  if (isAuth && bare.startsWith('/dashboard/')) {
    const segment = bare.split('/')[2] ?? ''
    const requiredRole = ROLE_BY_DASHBOARD_PREFIX[segment]
    const staffOnAdmin = role === 'staff' && segment === 'admin'
    if (requiredRole && role && requiredRole !== role && !staffOnAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = localized(ROLE_HOME[role], locale)
      return NextResponse.redirect(url)
    }
  }

  // Rien à intercepter : `next-intl` prend la main pour la réécriture vers le
  // segment [locale] et la mise à jour du cookie de langue.
  //
  // Le slug traduit est résolu AVANT de lui passer la main : `/en/about` n'a
  // pas de dossier, `/en/a-propos` oui. Réécriture et non redirection — l'URL
  // affichée reste `/en/about`, qui est justement ce qu'on cherchait.
  if (bare !== servedPath) {
    const url = request.nextUrl.clone()
    url.pathname = prefixed ? `/${locale}${bare}` : bare

    // Deux pièges se cumulent ici, et chacun donne un symptôme différent.
    //
    // 1. Passer la main à `next-intl` ne suffit pas : un chemin déjà préfixé
    //    lui paraît correct, il rend `next()` — qui reprend la requête
    //    d'ORIGINE, donc `/en/about`, qui n'a pas de dossier. 404 muet.
    // 2. Mais une réécriture SEULE ne suffit pas non plus : `next-intl`
    //    transmet la locale aux composants serveur par un en-tête de requête
    //    qu'il pose lui-même. Sans lui, `requestLocale` est absent et retombe
    //    sur le français — on obtenait une page au titre anglais et au corps
    //    français, ce que seule une vraie page ouverte à l'écran révèle.
    //
    // D'où les deux : on lui fait calculer sa réponse pour le chemin RÉÉCRIT,
    // et on reporte ses en-têtes sur notre réécriture.
    const intlResponse = intlMiddleware(new NextRequest(url, request))
    const response = NextResponse.rewrite(url)
    intlResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'x-middleware-rewrite') response.headers.set(key, value)
    })
    return response
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // `/api/*` est exclu : le rewrite next.config proximise vers le backend,
    // qui applique SA propre authentification. Seul le blog public
    // (/api/v1/public/blog/...) est volontairement sans token (cf. module Blog).
    // Les ressources PWA servies telles quelles (manifest, service worker,
    // icônes, CAPTURES D'ÉCRAN, sonde de version) sont aussi exclues : elles
    // doivent rester accessibles sans session — /version.json est sondé par
    // l'auto-update y compris visiteur anonyme.
    //
    // ⚠️ `screenshots` manquait, et les quatre captures du manifeste
    // répondaient 404 : passées par le middleware, elles étaient réécrites
    // vers le segment `[locale]`, où aucune route ne leur correspond (et
    // redirigées vers `/en/screenshots/...` pour un anglophone, qui n'existe
    // pas davantage). Le manifeste était donc servi avec quatre URL mortes,
    // Chrome ignorait les captures et retombait sur son invite d'installation
    // minimale — exactement ce qu'elles devaient éviter. Rien ne le signalait :
    // le manifeste lui-même répond 200, et les fichiers sont bien dans l'image.
    // Vu seulement en interrogeant les URL dans une pile Docker complète.
    // D'où `scripts/check-public-assets.mjs`.
    //
    // ⚠️ La page /offline, elle, n'est PAS exclue ici — elle l'a été jusqu'à
    // ce que les routes passent sous `[locale]`, et ça la cassait des deux
    // côtés : `/offline` renvoyait 404 (exclue du middleware, donc jamais
    // réécrite vers le segment de langue) et `/en/offline` partait sur
    // /auth/login (l'exclusion ne porte que sur le PREMIER segment, donc un
    // chemin préfixé y échappe). Elle passe désormais par le middleware, et
    // c'est PUBLIC_ROUTES qui la garde accessible sans session.
    //
    // `sitemap.xml` et `robots.txt` le sont pour une autre raison : ils ne se
    // déclinent PAS par langue. Un robot les cherche à la racine du domaine et
    // nulle part ailleurs ; les laisser passer par la détection de langue
    // renverrait /sitemap.xml vers /en/sitemap.xml, que rien n'ira lire.
    '/((?!_next/static|_next/image|favicon.ico|icons|images|screenshots|public|api|manifest.webmanifest|sw.js|version.json|sitemap.xml|robots.txt).*)',
  ],
}
