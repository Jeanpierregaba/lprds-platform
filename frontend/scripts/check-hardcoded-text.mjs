/**
 * Repère le texte visible resté EN DUR dans le JSX.
 *
 * Complément indispensable de `check-messages.mjs`, qui vérifie l'inverse :
 * que chaque clé appelée existe bien au catalogue. Aucun des deux ne suffit
 * seul — une chaîne écrite directement dans le JSX n'appelle aucune clé, donc
 * `check-messages` ne la voit pas, et elle s'affiche telle quelle au milieu
 * d'une interface dans l'autre langue.
 *
 * ⚠️ Cette garde a été réécrite après TROIS faux « aucune occurrence » :
 *
 *   1. l'analyse se faisait ligne à ligne, donc un paragraphe JSX écrit sur
 *      plusieurs lignes était invisible (toute la page /offline) ;
 *   2. la détection reposait sur les accents et une poignée de mots-outils,
 *      donc « Hors ligne », « Retour », « Annuler » passaient ;
 *   3. même élargie, elle ratait les mots isolés et sans accent —
 *      « Repas », « Personnel », « Oui », « Non », « Tableau de bord ».
 *
 * Les trois échecs venaient de la même racine : deviner du texte avec une
 * expression régulière sur du code. On ne devine donc plus. Le fichier est
 * ANALYSÉ par le compilateur TypeScript, et seuls les nœuds qui sont
 * réellement du texte affiché (`JsxText`, attributs visibles) sont examinés.
 *
 * Et puisque la position suffit à qualifier le défaut, la question « ce texte
 * est-il français ? » ne se pose plus : TOUT littéral en position visible est
 * un défaut, y compris en anglais. C'est ce qui ferme la classe de bug plutôt
 * qu'un symptôme de plus.
 *
 * Usage :
 *   node scripts/check-hardcoded-text.mjs           # liste les occurrences
 *   node scripts/check-hardcoded-text.mjs --strict  # sort en échec s'il en reste
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import ts from 'typescript'

/**
 * Ce qui ne se traduit pas : noms propres, marques, sigles, formats et unités.
 *
 * Un fragment n'est signalé que s'il reste des lettres UNE FOIS ces jetons
 * retirés — « PDF / Excel » ne déclenche donc rien, « Format PDF » si.
 */
const ALLOWLIST = [
  'Les Petits Rayons de Soleil',
  'LPRDS',
  'Africa/Porto-Novo',
  'PDF',
  'Excel',
  'JPG',
  'PNG',
  'GIF',
  'WebP',
  'QR',
  'Mo',
  'Ko',
  'OK',
]

/** Attributs dont la valeur est lue ou annoncée à l'utilisateur. */
const VISIBLE_ATTRS = new Set([
  'placeholder',
  'title',
  'alt',
  'label',
  'aria-label',
  'aria-description',
])

const files = execSync("find src -name '*.tsx' -not -path '*/ui/*'", {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)

/** Reste-t-il du texte une fois les noms propres et la ponctuation retirés ? */
function isTranslatable(text) {
  let rest = text
  for (const allowed of ALLOWLIST) rest = rest.split(allowed).join(' ')
  // Entités HTML (`&apos;`, `&amp;`) : du balisage, pas des mots.
  rest = rest.replace(/&[a-z]+;/gi, ' ')
  return /[A-Za-zÀ-ÿ]{2}/.test(rest)
}

const hits = []

for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  )

  const record = (node, raw) => {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text || !isTranslatable(text)) return
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    hits.push({ file, line: line + 1, text })
  }

  const visit = (node) => {
    // Texte d'élément : `<p>Bonjour</p>`. Le compilateur a déjà séparé le
    // texte du code, des expressions `{…}` et des commentaires — c'est
    // précisément ce que l'expression régulière n'arrivait pas à faire.
    if (ts.isJsxText(node)) record(node, node.text)

    // Attributs visibles écrits en littéral : `placeholder="Rechercher"`.
    // Une valeur `{t('…')}` n'est pas un `StringLiteral`, donc jamais
    // signalée.
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      VISIBLE_ATTRS.has(node.name.getText(source))
    ) {
      record(node, node.initializer.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
}

const strict = process.argv.includes('--strict')

if (hits.length === 0) {
  console.log('[check-hardcoded-text] aucun texte visible en dur.')
  process.exit(0)
}

const byFile = new Map()
for (const hit of hits) {
  if (!byFile.has(hit.file)) byFile.set(hit.file, [])
  byFile.get(hit.file).push(hit)
}

console.log(`\n${hits.length} texte(s) visible(s) en dur dans le JSX :\n`)
for (const [file, entries] of byFile) {
  console.log(`  ${file}`)
  for (const entry of entries) {
    console.log(`    ${entry.line}  ${entry.text.slice(0, 80)}`)
  }
}
console.log(
  '\nCes chaînes s’affichent telles quelles, quelle que soit la langue choisie.\n' +
    'Les remplacer par un appel de traduction, ou ajouter le nom propre à ALLOWLIST.',
)

process.exit(strict ? 1 : 0)
