/**
 * Vérifie que la garde d'authentification du middleware couvre bien toutes les
 * routes de l'application.
 *
 * `src/proxy.ts` (l'ancien `middleware.ts`) protégeait l'espace connecté par la négative : « tout ce
 * qui n'est pas listé comme public exige une session ». Juste pour les routes
 * qui existent, faux pour toutes les autres — une URL inconnue n'étant dans
 * aucune liste, un visiteur anonyme arrivant sur `/une-page-inconnue` était
 * redirigé vers l'écran de connexion au lieu de recevoir une 404.
 *
 * La règle a donc été inversée : le middleware NOMME l'espace privé
 * (`/dashboard`), et tout le reste traverse. Cette inversion met le défaut du
 * bon côté pour les URL inconnues, mais déplace le risque : une future route
 * privée posée ailleurs que sous `/dashboard` serait servie à n'importe qui,
 * **sans la moindre erreur** — la page s'afficherait, simplement. C'est le
 * profil de défaut que ce projet refuse de laisser à la vigilance humaine.
 *
 * D'où cette garde : chaque route du disque doit être soit sous le préfixe
 * privé, soit explicitement déclarée publique dans le middleware. Une route
 * qui n'est ni l'un ni l'autre fait échouer `pnpm lint`, en nommant le fichier.
 *
 * Usage :
 *   node scripts/check-private-routes.mjs           # liste
 *   node scripts/check-private-routes.mjs --strict  # échoue s'il en reste
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PROXY = 'src/proxy.ts'
const source = readFileSync(PROXY, 'utf8')

/** Extrait les chemins d'un tableau de littéraux du middleware. */
function routeList(name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`))
  if (!match) {
    console.error(`[check-private-routes] ${name} introuvable dans ${PROXY}.`)
    process.exit(1)
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const privateMatch = source.match(/const PRIVATE_PREFIX = '([^']+)'/)
if (!privateMatch) {
  console.error(`[check-private-routes] PRIVATE_PREFIX introuvable dans ${PROXY}.`)
  process.exit(1)
}
const PRIVATE_PREFIX = privateMatch[1]
const PUBLIC = [...routeList('PUBLIC_ROUTES'), ...routeList('MARKETING_ROUTES')]

// Routes réelles : chemin nu, groupes de route `(marketing)` retirés, segments
// dynamiques conservés (ils n'entrent pas en compte dans un `startsWith`).
const routes = execSync(
  "find 'src/app/[locale]' -name page.tsx",
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((file) =>
    file
      .replace('src/app/[locale]', '')
      .replace('/page.tsx', '')
      .replace(/\/\([^)]+\)/g, '') || '/',
  )
  .sort()

const problems = []
for (const route of routes) {
  const isPrivate = route === PRIVATE_PREFIX || route.startsWith(`${PRIVATE_PREFIX}/`)
  const isPublic = route === '/' || PUBLIC.some((p) => route.startsWith(p))
  if (!isPrivate && !isPublic) {
    problems.push(
      `${route} — ni sous ${PRIVATE_PREFIX} ni déclarée publique : ` +
        'servie à un visiteur anonyme sans aucune erreur',
    )
  }
}

const strict = process.argv.includes('--strict')

if (problems.length === 0) {
  console.log(
    `[check-private-routes] ${routes.length} routes, toutes couvertes par la garde.`,
  )
  process.exit(0)
}

console.log(`\n${problems.length} route(s) hors garde d'authentification :\n`)
for (const problem of problems) console.log(`  ${problem}`)
console.log(
  `\nSoit la poser sous ${PRIVATE_PREFIX}, soit l'ajouter à PUBLIC_ROUTES / ` +
    `MARKETING_ROUTES dans ${PROXY} si elle est bien publique.\n`,
)
process.exit(strict ? 1 : 0)
