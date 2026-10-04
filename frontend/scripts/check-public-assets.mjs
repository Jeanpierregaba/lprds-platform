/* Garde — tout asset statique référencé doit ÉCHAPPER au middleware de langue.
 *
 * Un fichier de `public/` servi tel quel (icône, capture, manifeste) n'a pas
 * de route sous le segment `[locale]`. S'il n'est pas exclu du matcher du
 * middleware, celui-ci le réécrit vers ce segment : la réponse est une 404
 * (ou, pour un visiteur anglophone, une redirection vers `/en/...` qui n'existe
 * pas davantage).
 *
 * ⚠️ **Rien ne le signale.** Le fichier est bien dans l'image, `pnpm build`
 * passe, le manifeste répond 200 et déclare ses captures — seule l'URL de la
 * capture échoue. C'est ainsi que les quatre captures du manifeste ont été
 * livrées mortes : Chrome ignorait les captures et retombait sur son invite
 * d'installation minimale, c'est-à-dire exactement ce qu'elles devaient
 * éviter. Le défaut n'est apparu qu'en interrogeant les URL une à une dans une
 * pile Docker complète.
 *
 * Règle appliquée : tout chemin référencé qui porte une EXTENSION de fichier
 * est un asset statique et doit être exclu du matcher. Les chemins sans
 * extension (`/`, `/en`, `/offline`) sont des PAGES et doivent, elles, passer
 * par le middleware — c'est lui qui les réécrit vers la bonne langue.
 */
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const middleware = read('../src/middleware.ts')
const matcher = middleware.match(/'\/\(\(\?!([^)]+)\)\.\*\)'/)?.[1]
if (!matcher) {
  console.error('✗ matcher du middleware introuvable dans src/middleware.ts')
  process.exit(1)
}
const excluded = new Set(matcher.split('|'))

/* Sources de vérité des assets référencés : le manifeste (icônes, captures,
 * raccourcis) et la liste précachée du service worker. */
const sources = {
  'src/app/manifest.ts': read('../src/app/manifest.ts'),
  'public/sw.js': read('../public/sw.js'),
}

const problems = []
for (const [file, content] of Object.entries(sources)) {
  // Chemins absolus écrits en littéral ou en gabarit : '/icons/x.png',
  // `/screenshots/w-${locale}.jpg`.
  const paths = content.match(/['"`]\/[A-Za-z0-9/._${}-]*['"`]/g) ?? []
  for (const raw of paths) {
    const path = raw.slice(1, -1)
    const [, segment] = path.split('/')
    if (!segment) continue
    // Pas d'extension = une page, qui DOIT passer par le middleware.
    const last = path.split('/').pop()
    if (!/\.[A-Za-z0-9]+$/.test(last)) continue
    // Le matcher exclut sur le PREMIER segment (ou le nom de fichier à la racine).
    if (excluded.has(segment) || excluded.has(segment.replace(/\./g, '.'))) continue
    problems.push(`${file} → ${path} (segment « ${segment} » absent du matcher)`)
  }
}

const unique = [...new Set(problems)]
if (unique.length > 0) {
  console.error('✗ assets statiques servis à travers le middleware de langue :')
  for (const p of unique) console.error(`  - ${p}`)
  console.error('\n  Ajouter le segment à la liste d\'exclusion du matcher (src/middleware.ts).')
  process.exit(1)
}
console.log('✓ assets statiques — tous exclus du middleware de langue')
