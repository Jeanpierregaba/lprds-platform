/**
 * Repère les messages de validation Zod écrits EN DUR dans le code.
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
 * qu'un formulaire est soumis de travers — sans la moindre erreur ni au
 * type-check ni au lint.
 *
 * ⚠️ Comme `check-hardcoded-text.mjs`, cette garde a d'abord annoncé « aucune
 * occurrence » alors qu'il restait des messages français : sa détection
 * reposait sur les accents et une liste de mots-outils, et ratait « Nombre
 * entier », « Min 0 jour », « Max 90 jours ».
 *
 * La correction est la même, et c'est la leçon du chantier : la POSITION
 * suffit à qualifier le défaut. Un littéral en position de message Zod est
 * toujours un défaut, quelle que soit sa langue — il n'y a donc plus rien à
 * deviner, et plus de liste de mots à tenir à jour. L'analyse passe par le
 * compilateur TypeScript, ce qui couvre aussi les appels écrits sur plusieurs
 * lignes.
 *
 * Usage :
 *   node scripts/check-zod-messages.mjs           # liste les occurrences
 *   node scripts/check-zod-messages.mjs --strict  # sort en échec s'il en reste
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import ts from 'typescript'

/** Noms propres et marques : jamais traduits, donc jamais signalés. */
const ALLOWLIST = [
  'Les Petits Rayons de Soleil',
  'LPRDS',
]

/** Validateurs Zod dont un argument est le message d'erreur. */
const VALIDATORS = new Set([
  'min', 'max', 'length', 'gt', 'gte', 'lt', 'lte',
  'int', 'positive', 'nonnegative', 'nonempty',
  'email', 'url', 'uuid', 'regex', 'startsWith', 'endsWith', 'includes',
  'refine', 'superRefine', 'check',
])

/** Formes objet : `{ message: '…' }`, `{ error: '…' }`, `required_error`… */
const KEYS = new Set(['message', 'error', 'required_error', 'invalid_type_error'])

const files = execSync(
  "find src \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/ui/*'",
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)

const hits = []

for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const record = (node) => {
    const text = node.text.trim()
    if (!text || !/[A-Za-zÀ-ÿ]{2}/.test(text)) return
    if (ALLOWLIST.some((allowed) => text.includes(allowed))) return
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    hits.push({ file, line: line + 1, text })
  }

  const isMessage = (node) =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)

  /**
   * L'appel appartient-il à une chaîne Zod ?
   *
   * Indispensable : `startsWith`, `endsWith`, `includes` et `min` sont AUSSI
   * des méthodes de `String` et de tableaux. Sans cette vérification,
   * `path.startsWith('/dashboard/')` ou `type.startsWith('image/')` seraient
   * signalés comme des messages de validation — la position ne suffit donc
   * pas ici, contrairement au texte JSX.
   *
   * On remonte la chaîne d'appels jusqu'à son expression la plus à gauche, et
   * on exige que ce soit `z` : `z.string().min(…)`, `z.coerce.number().int(…)`.
   */
  const rootsAtZod = (node) => {
    let current = node
    while (current) {
      if (ts.isCallExpression(current)) current = current.expression
      else if (ts.isPropertyAccessExpression(current)) current = current.expression
      else break
    }
    return current && ts.isIdentifier(current) && current.text === 'z'
  }

  const visit = (node) => {
    // `.min(1, 'Trop court')`, `.int('Nombre entier')`, `.refine(fn, '…')` —
    // un message DÉJÀ traduit est un appel `t('…')`, pas un littéral, donc
    // jamais signalé.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      VALIDATORS.has(node.expression.name.getText(source)) &&
      rootsAtZod(node)
    ) {
      for (const arg of node.arguments) if (isMessage(arg)) record(arg)
    }

    // `{ message: '…' }` et variantes, où qu'elles se trouvent.
    if (
      ts.isPropertyAssignment(node) &&
      KEYS.has(node.name.getText(source).replace(/['"]/g, '')) &&
      isMessage(node.initializer) &&
      // Même précaution : `{ message: '…' }` existe ailleurs que chez Zod
      // (options d'une requête, payload d'API…).
      (() => {
        for (let a = node.parent; a; a = a.parent) {
          if (ts.isCallExpression(a) && rootsAtZod(a)) return true
        }
        return false
      })()
    ) {
      record(node.initializer)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
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

console.log(`\n${hits.length} message(s) de validation en dur dans les schémas Zod :\n`)
for (const [file, entries] of byFile) {
  console.log(`  ${file}`)
  for (const entry of entries) {
    console.log(`    ${entry.line}  ${entry.text.slice(0, 80)}`)
  }
}
console.log(
  '\nCes messages s’affichent sous le champ fautif, tels quels, quelle que soit la langue.\n' +
    'Les remplacer par un appel de traduction — schéma construit par une fabrique\n' +
    '`makeSchema(t)` quand le schéma est une constante de module.',
)

process.exit(strict ? 1 : 0)
