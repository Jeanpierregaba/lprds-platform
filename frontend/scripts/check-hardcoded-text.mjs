/**
 * Repère le texte FRANÇAIS resté en dur dans le JSX.
 *
 * Complément indispensable de `check-messages.mjs`, qui vérifie l'inverse :
 * que chaque clé appelée existe bien au catalogue. Aucun des deux ne suffit
 * seul — une chaîne écrite directement dans le JSX n'appelle aucune clé, donc
 * `check-messages` ne la voit pas, et elle s'affiche en français au milieu
 * d'une interface anglaise sans la moindre erreur.
 *
 * L'heuristique est volontairement simple (accents + mots-outils français) :
 * mieux vaut quelques faux positifs à écarter explicitement qu'un filtre
 * savant qui laisse passer de vraies chaînes.
 *
 * Usage :
 *   node scripts/check-hardcoded-text.mjs           # liste les occurrences
 *   node scripts/check-hardcoded-text.mjs --strict  # sort en échec s'il en reste
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/** Noms propres et marques : jamais traduits, donc jamais signalés. */
const ALLOWLIST = [
  'Les Petits Rayons de Soleil',
  'LPRDS',
]

/**
 * Accents, mots-outils, ET quelques mots français courants sans accent.
 *
 * Les accents seuls ne suffisent pas : « Hors ligne », « Retour », « Aucun
 * media » passaient au travers — un faux négatif est bien plus coûteux qu'un
 * faux positif, qu'il suffit d'écarter via ALLOWLIST.
 */
const FRENCH =
  /[éèêàçùôûîï]|\b(le|la|les|des|une|un|aucun|aucune|pour|avec|sans|votre|vos|cette|dans|hors|vers|chez|puis|donc|mais|plus|tous|toutes|chaque|ligne|retour|essayer|envoyer|ajouter|modifier|supprimer|enregistrer|annuler|fermer|ouvrir|charger|choisir|selectionner)\b/i

const files = execSync("find src -name '*.tsx' -not -path '*/ui/*'", {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)

/** Retire les commentaires — ils sont en français par convention dans ce projet. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\`])\/\/[^\n]*/g, (match, prefix) => prefix + ' '.repeat(match.length - prefix.length))
}

const hits = []

for (const file of files) {
  const source = stripComments(readFileSync(file, 'utf8'))

  // Texte d'élément — SANS le drapeau `m` et en autorisant les sauts de ligne :
  // un paragraphe JSX s'écrit couramment sur plusieurs lignes, et une analyse
  // ligne à ligne le rate entièrement (piège vécu sur la page /offline, dont
  // les trois chaînes françaises étaient invisibles pour ce contrôle).
  const candidates = [
    ...[...source.matchAll(/>([^<>{}]{3,})</g)].map((m) => ({
      text: m[1],
      index: m.index,
    })),
    ...[
      ...source.matchAll(/(?:placeholder|title|alt|label|aria-label)="([^"]{3,})"/g),
    ].map((m) => ({ text: m[1], index: m.index })),
  ]

  for (const { text: raw, index } of candidates) {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text || !FRENCH.test(text)) continue
    if (/^[\d\s.,:/%€-]+$/.test(text)) continue
    if (ALLOWLIST.some((allowed) => text.includes(allowed))) continue
    const line = source.slice(0, index).split('\n').length
    hits.push({ file, line, text })
  }
}

const strict = process.argv.includes('--strict')

if (hits.length === 0) {
  console.log('[check-hardcoded-text] aucune chaîne française en dur.')
  process.exit(0)
}

const byFile = new Map()
for (const hit of hits) {
  if (!byFile.has(hit.file)) byFile.set(hit.file, [])
  byFile.get(hit.file).push(hit)
}

console.log(`\n${hits.length} chaîne(s) française(s) en dur dans le JSX :\n`)
for (const [file, entries] of byFile) {
  console.log(`  ${file}`)
  for (const entry of entries) {
    console.log(`    ${entry.line}  ${entry.text.slice(0, 80)}`)
  }
}
console.log(
  '\nCes chaînes s’affichent telles quelles dans l’interface anglaise.\n' +
    'Les remplacer par un appel de traduction, ou ajouter le nom propre à ALLOWLIST.',
)

process.exit(strict ? 1 : 0)
