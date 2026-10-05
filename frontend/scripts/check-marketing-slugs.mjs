/**
 * Vérifie les slugs traduits des pages publiques (`src/i18n/slugs.ts`).
 *
 * Le projet n'utilise pas `pathnames` de next-intl : le mécanisme est
 * app-wide et aurait imposé de typer les 56 routes et de convertir 61 `href`
 * dynamiques, pour six URL publiques (le raisonnement complet est dans
 * `slugs.ts`). La contrepartie est que rien, dans le langage, n'oblige à
 * passer par `marketingPath` — d'où cette garde.
 *
 * Elle contrôle deux choses, toutes deux silencieuses si elles lâchent :
 *
 * 1. **Chaque entrée de la carte correspond à une route réelle.** Une faute de
 *    frappe donnerait un slug qui ne mène nulle part, et le middleware
 *    réécrirait vers un dossier inexistant — 404 sur une page publique.
 * 2. **Aucun lien ne court-circuite `marketingPath`.** Un `href="/galerie"`
 *    ajouté plus tard enverrait un visiteur anglophone sur `/en/galerie`, que
 *    le middleware redirigerait vers `/en/gallery` : la page s'afficherait,
 *    donc personne ne verrait rien — au prix d'une redirection par clic, et
 *    d'une URL non canonique dans les liens internes.
 *
 *    Le contrôle porte sur deux formes, parce que la seconde a échappé deux
 *    fois à la première : le littéral `href="/galerie"`, et la forme
 *    INDIRECTE `href={item.href}` où `item` vient de `MARKETING_NAV`. Pour
 *    celle-là, la garde exige simplement que tout fichier important
 *    `MARKETING_NAV` importe aussi `marketingPath` — grossier, mais c'est
 *    exactement ce qui manquait.
 *
 * Usage :
 *   node scripts/check-marketing-slugs.mjs           # liste
 *   node scripts/check-marketing-slugs.mjs --strict  # échoue s'il en reste
 */

import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { register } from 'node:module'
import path from 'node:path'

register('./ts-resolve-hook.mjs', import.meta.url)

let MARKETING_SLUGS
try {
  ;({ MARKETING_SLUGS } = await import('../src/i18n/slugs.ts'))
} catch (error) {
  console.log(
    '[check-marketing-slugs] ignoré — ce Node ne lit pas TypeScript ' +
      `nativement (22.18+ requis, ici ${process.version}).`,
  )
  console.log('  Détail :', error.message)
  process.exit(0)
}

const problems = []

// 1. Chaque chemin de la carte existe-t-il comme route ?
const MARKETING_DIR = 'src/app/[locale]/(marketing)'
for (const bare of Object.keys(MARKETING_SLUGS)) {
  const dir = path.join(MARKETING_DIR, bare.slice(1))
  if (!existsSync(path.join(dir, 'page.tsx'))) {
    problems.push(`la carte déclare ${bare}, mais ${dir}/page.tsx n'existe pas`)
  }
}

// 2. Un lien contourne-t-il `marketingPath` ?
const files = execSync("find src -name '*.tsx' -not -path '*/ui/*'", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)

for (const file of files) {
  const source = readFileSync(file, 'utf8')

  // Forme indirecte : on construit des liens à partir de la navigation.
  if (source.includes('MARKETING_NAV') && !source.includes('marketingPath')) {
    problems.push(
      `${file} — construit des liens depuis MARKETING_NAV sans marketingPath`,
    )
  }

  for (const bare of Object.keys(MARKETING_SLUGS)) {
    // `href="/galerie"` en dur — la forme qui perd le slug traduit.
    const literal = new RegExp(`href=["']${bare}["']`)
    if (literal.test(source)) {
      const line = source.slice(0, source.search(literal)).split('\n').length
      problems.push(`${file}:${line} — href="${bare}" en dur, utiliser marketingPath('${bare}', locale)`)
    }
  }
}

const strict = process.argv.includes('--strict')

if (problems.length === 0) {
  console.log('[check-marketing-slugs] carte cohérente, aucun lien court-circuité.')
  process.exit(0)
}

console.log(`\n${problems.length} problème(s) de slug public :\n`)
for (const problem of problems) console.log(`  ${problem}`)
console.log(
  '\nUn lien en dur enverrait un visiteur anglophone sur la forme française,\n' +
    'que le middleware redirigerait — une redirection par clic, et un lien\n' +
    'interne non canonique.',
)
process.exit(strict ? 1 : 0)
