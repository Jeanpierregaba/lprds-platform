import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { resolveLocale } from '@/i18n/detect'
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
 *   1. résoudre la langue (préfixe d'URL, cookie, puis `Accept-Language`) ;
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
  return locale === DEFAULT_LOCALE ? path : `/${locale}${path}`
}

/** Sépare un chemin en (langue explicite ou non, chemin nu). */
function splitLocale(pathname: string): { prefixed: boolean; bare: string } {
  const segments = pathname.split('/')
  const first = segments[1]

  if (!isAppLocale(first)) return { prefixed: false, bare: pathname }

  const rest = segments.slice(2).join('/')
  return { prefixed: true, bare: rest ? `/${rest}` : '/' }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { prefixed, bare } = splitLocale(pathname)

  // Une langue explicite dans l'URL fait toujours foi : elle exprime une
  // intention (lien partagé, favori, choix du sélecteur) et ne doit jamais
  // être écrasée par la préférence du navigateur.
  const locale: AppLocale = prefixed
    ? (pathname.split('/')[1] as AppLocale)
    : resolveLocale(
        request.cookies.get(LOCALE_COOKIE)?.value,
        request.headers.get('accept-language'),
      )

  // Détection automatique — un visiteur dont l'appareil n'est pas en français
  // et qui arrive sur une URL sans préfixe est envoyé vers sa version anglaise.
  // `next-intl` ne peut pas s'en charger : son repli natif ramènerait au
  // français toute langue qu'il ne reconnaît pas (cf. src/i18n/detect.ts).
  if (!prefixed && locale !== DEFAULT_LOCALE) {
    const url = request.nextUrl.clone()
    url.pathname = localized(pathname, locale)
    return NextResponse.redirect(url)
  }

  const isMarketing = bare === '/' || MARKETING_ROUTES.some((r) => bare.startsWith(r))
  const isPublic = isMarketing || PUBLIC_ROUTES.some((r) => bare.startsWith(r))

  // Lire le token + rôle depuis le cookie
  const storageRaw = request.cookies.get('lprds-auth')?.value
  let accessToken: string | null = null
  let role: UserRole | null = null

  if (storageRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(storageRaw))
      accessToken = parsed?.state?.accessToken ?? null
      role = parsed?.state?.user?.role ?? null
    } catch {
      accessToken = null
      role = null
    }
  }

  const isAuth = !!accessToken

  // Non-authentifié sur route privée → login
  if (!isAuth && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = localized('/auth/login', locale)
    return NextResponse.redirect(url)
  }

  // Authentifié sur page auth ou marketing → accueil de son rôle.
  // Repli sur /auth/login (jamais '/', désormais public : un rôle absent
  // renverrait sinon en boucle vers cette même règle).
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
  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // `/api/*` est exclu : le rewrite next.config proximise vers le backend,
    // qui applique SA propre authentification. Seul le blog public
    // (/api/v1/public/blog/...) est volontairement sans token (cf. module Blog).
    // Les ressources PWA servies telles quelles (manifest, service worker,
    // icônes, sonde de version) sont aussi exclues : elles doivent rester
    // accessibles sans session — /version.json est sondé par l'auto-update y
    // compris visiteur anonyme.
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
    '/((?!_next/static|_next/image|favicon.ico|icons|images|public|api|manifest.webmanifest|sw.js|version.json|sitemap.xml|robots.txt).*)',
  ],
}
