import { NextResponse, type NextRequest } from 'next/server'
import { ROLE_HOME, type UserRole } from '@/types/auth'

const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/reset-password',
  '/auth/new-password',
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isMarketing = pathname === '/' || MARKETING_ROUTES.some((r) => pathname.startsWith(r))
  const isPublic = isMarketing || PUBLIC_ROUTES.some((r) => pathname.startsWith(r))

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
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Authentifié sur page auth ou marketing → accueil de son rôle.
  // Repli sur /auth/login (jamais '/', désormais public : un rôle absent
  // renverrait sinon en boucle vers cette même règle).
  if (isAuth && isPublic && pathname !== '/auth/new-password') {
    const url = request.nextUrl.clone()
    url.pathname = role ? ROLE_HOME[role] : '/auth/login'
    return NextResponse.redirect(url)
  }

  // Garde par rôle sur /dashboard/<segment>/...
  // Exception : le staff réutilise les pages /dashboard/admin/* (RBAC dynamique,
  // cf. claude.md) — le contrôle réel se fait côté backend par permission, pas ici.
  if (isAuth && pathname.startsWith('/dashboard/')) {
    const segment = pathname.split('/')[2] ?? ''
    const requiredRole = ROLE_BY_DASHBOARD_PREFIX[segment]
    const staffOnAdmin = role === 'staff' && segment === 'admin'
    if (requiredRole && role && requiredRole !== role && !staffOnAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = ROLE_HOME[role]
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // `/api/*` est exclu : le rewrite next.config proximise vers le backend,
    // qui applique SA propre authentification. Seul le blog public
    // (/api/v1/public/blog/...) est volontairement sans token (cf. module Blog).
    // Les ressources PWA (manifest, service worker, page /offline, icônes,
    // sonde de version) sont aussi exclues : elles doivent rester accessibles
    // sans session — /version.json est sondé par l'auto-update y compris
    // visiteur anonyme.
    '/((?!_next/static|_next/image|favicon.ico|icons|images|public|api|manifest.webmanifest|sw.js|offline|version.json).*)',
  ],
}
