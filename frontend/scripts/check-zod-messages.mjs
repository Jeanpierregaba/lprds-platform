/**
 * Repère les messages de validation Zod écrits en FRANÇAIS dans le code.
 *
 * Troisième garde i18n du projet, et le seul angle que les deux autres ne
 * peuvent pas voir :
 *
 *   - `check-messages.mjs` vérifie que toute clé APPELÉE existe au catalogue.
 *     Un message écrit en dur n'appelle aucune clé : invisible pour lui.
 *   - `check-hardcoded-text.mjs` balaie le JSX (texte d'élément et attributs
 *     visibles). Un message Zod vit dans un argument de fonction TypeScript,
 *     jamais dans le JSX : invisible pour lui aussi.
 *
 * Or ces messages s'affichent bel et bien à l'écran, sous le champ fautif, dès
 * qu'un formulaire est soumis de travers — en français au milieu d'une
 * interface anglaise, sans la moindre erreur ni au type-check ni au lint.
 *
 * L'heuristique suit celle de `check-hardcoded-text.mjs` : accents et
 * mots-outils français, appliqués UNIQUEMENT aux positions où Zod attend un
 * message. Cibler la position plutôt que le fichier évite d'avoir à distinguer
 * un message d'une valeur d'énumération ou d'un nom de champ.
 *
 * Usage :
 *   node scripts/check-zod-messages.mjs           # liste les occurrences
 *   node scripts/check-zod-messages.mjs --strict  # sort en échec s'il en reste
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/** Noms propres et marques : jamais traduits, donc jamais signalés. */
const ALLOWLIST = [
  'Les Petits Rayons de Soleil',
  'LPRDS',
]

const FRENCH =
  /[éèêàçùôûîï]|\b(le|la|les|des|une|aucun|aucune|pour|avec|sans|votre|vos|cette|dans|requis|requise|invalide|minimum|maximum|obligatoire|doit)\b/i

/** Validateurs Zod dont le dernier argument est le message d'erreur. */
const VALIDATORS = [
  'min', 'max', 'length', 'gt', 'gte', 'lt', 'lte',
  'int', 'positive', 'nonnegative', 'nonempty',
  'email', 'url', 'uuid', 'regex', 'startsWith', 'endsWith', 'includes',
  'refine', 'superRefine', 'check',
].join('|')

/** Formes objet : `{ message: '…' }`, `{ error: '…' }`, `required_error`… */
const KEYS = 'message|error|required_error|invalid_type_error'

// `[^()'"]*?` interdit de franchir une parenthèse ouvrante : un message déjà
// traduit (`.min(1, t('…'))`) n'est donc jamais capturé, la clé vivant dans
// l'appel imbriqué `t(`.
const MESSAGE = new RegExp(
  `(?:\\.(?:${VALIDATORS})\\([^()'"\`]*?|(?:${KEYS})\\s*:\\s*)` +
    `(['"\`])([^'"\`\\n]{2,})\\1`,
  'g',
)

const files = execSync("find src \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/ui/*'", {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)

const hits = []

for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return // commentaires : en français par convention

      MESSAGE.lastIndex = 0
      for (const match of line.matchAll(MESSAGE)) {
        const text = match[2].trim()
        if (!text || !FRENCH.test(text)) continue
        if (ALLOWLIST.some((allowed) => text.includes(allowed))) continue
        hits.push({ file, line: index + 1, text })
      }
    })
}

const strict = process.argv.includes('--strict')

if (hits.length === 0) {
  console.log('[check-zod-messages] aucun message de validation en dur.')
  process.exit(0)
}

const byFile = new Map()
for (const hit of hits) {
  if (!byFile.has(hit.file)) byFile.set(hit.file, [])
  byFile.get(hit.file).push(hit)
}

console.log(`\n${hits.length} message(s) de validation en français dans les schémas Zod :\n`)
for (const [file, entries] of byFile) {
  console.log(`  ${file}`)
  for (const entry of entries) {
    console.log(`    ${entry.line}  ${entry.text.slice(0, 80)}`)
  }
}
console.log(
  '\nCes messages s’affichent sous le champ fautif, en français, dans l’interface anglaise.\n' +
    'Les remplacer par un appel de traduction — schéma construit par une fabrique\n' +
    '`makeSchema(t)` quand le schéma est une constante de module.',
)

process.exit(strict ? 1 : 0)
