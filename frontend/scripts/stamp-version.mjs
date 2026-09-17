/* Estampille la version du build pour l'auto-update PWA.
 *
 * Exécuté en `prebuild` (avant `next build`) : écrit `public/version.json`
 * avec la version que le client compare à celle compilée dans son bundle
 * (`NEXT_PUBLIC_APP_VERSION`). Ordre de résolution :
 *   1. NEXT_PUBLIC_APP_VERSION (CI / .env de prod — ex. hash git, tag, date)
 *   2. `git rev-parse --short HEAD` (build local depuis un dépôt git)
 *   3. horodatage (repli — garantit un fichier valide, jamais de 404)
 *
 * Sans NEXT_PUBLIC_APP_VERSION au build, le bundle n'a aucune version et
 * l'auto-update côté client reste désactivé (repli sûr, pas de boucle).
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function resolveVersion() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim()
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return new Date().toISOString()
  }
}

const version = resolveVersion()
writeFileSync(
  new URL('../public/version.json', import.meta.url),
  JSON.stringify({ version }) + '\n',
)
console.log(`[stamp-version] version=${version}`)
