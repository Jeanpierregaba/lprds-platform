#!/usr/bin/env node
/**
 * Vérifie que chaque clé de traduction appelée dans le code existe réellement
 * dans le catalogue français, locale de référence.
 *
 * Pourquoi ce script : une clé inexistante ne casse rien. `next-intl` affiche
 * son chemin tel quel — « marketing.home.meta.title » s'est retrouvé dans le
 * titre d'un onglet en phase 1 — et le contrôle de types n'y voit rien, parce
 * qu'il ne vérifie que la parité ENTRE les deux langues, jamais qu'une clé
 * appelée existe. À quelques centaines de clés on s'en aperçoit à l'œil ; à
 * plusieurs milliers, non.
 *
 * Portée assumée : seules les clés littérales sont vérifiables. Un appel
 * construit dynamiquement (`t(`sections.${id}.title`)`) est compté à part et
 * signalé, jamais traité comme une erreur — le script ne devine pas la valeur
 * de `id`.
 *
 * Usage : node scripts/check-messages.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const MESSAGES = join(ROOT, 'messages', 'fr')

// ── Catalogue de référence ──────────────────────────────────────
function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    // Un tableau est une valeur terminale (listes d'activités, lues via t.raw).
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out)
    } else {
      out.add(path)
    }
  }
  return out
}

const catalogue = new Set()
for (const file of readdirSync(MESSAGES)) {
  if (!file.endsWith('.json')) continue
  const domain = file.replace(/\.json$/, '')
  const content = JSON.parse(readFileSync(join(MESSAGES, file), 'utf8'))
  for (const key of flatten(content)) catalogue.add(`${domain}.${key}`)
}

// ── Parcours des sources ────────────────────────────────────────
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (/\.tsx?$/.test(full)) yield full
  }
}

// `const t = useTranslations('ns')` / `await getTranslations('ns')`
const BIND_SHORT = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:use|get)Translations\(\s*'([^']*)'\s*\)/g
// `await getTranslations({ locale, namespace: 'ns' })`
const BIND_OBJECT = /(?:const|let)\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*'([^']+)'[^}]*\}\s*\)/g
// `useTranslations('ns')` passé directement en argument (sans binding)
const INLINE = /(?:use|get)Translations\(\s*'([^']*)'\s*\)/g

const missing = []
let dynamic = 0
let checked = 0

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  // Un même nom (typiquement `t`) peut désigner DEUX domaines dans un même
  // fichier : celui de `generateMetadata` et celui du composant. On retient
  // donc tous les domaines associés à un nom, et une clé est considérée
  // valide dès qu'elle existe dans l'un d'eux. Approximation délibérée :
  // reproduire les portées de TypeScript pour ce seul contrôle coûterait plus
  // cher que le bénéfice, et l'inverse — signaler des clés parfaitement
  // valides — rendrait le script inutilisable.
  const bindings = new Map()

  for (const re of [BIND_SHORT, BIND_OBJECT]) {
    re.lastIndex = 0
    for (const m of src.matchAll(re)) {
      if (!bindings.has(m[1])) bindings.set(m[1], new Set())
      bindings.get(m[1]).add(m[2])
    }
  }

  // Namespaces cités dans le fichier, même sans binding nommé — sert à
  // signaler un domaine entier qui n'existerait pas.
  INLINE.lastIndex = 0
  for (const m of src.matchAll(INLINE)) {
    const ns = m[1]
    if (ns && ![...catalogue].some((k) => k === ns || k.startsWith(`${ns}.`))) {
      missing.push({ file, key: ns, reason: 'domaine inconnu' })
    }
  }

  for (const [name, namespaces] of bindings) {
    // Appels littéraux : t('a.b') et t.rich / t.raw
    const call = new RegExp(`\\b${name}(?:\\.(?:rich|raw|markup))?\\(\\s*(['"\`])([^'"\`]*)\\1`, 'g')
    for (const m of src.matchAll(call)) {
      const raw = m[2]
      if (m[1] === '`' || raw.includes('${')) { dynamic++; continue }
      checked++
      const candidates = [...namespaces].map((ns) => (ns ? `${ns}.${raw}` : raw))
      if (!candidates.some((key) => catalogue.has(key))) {
        missing.push({ file, key: candidates.join('  ou  '), reason: 'clé absente' })
      }
    }
    // Gabarits : t(`a.${x}.b`) — non vérifiables, comptés pour information
    const tpl = new RegExp(`\\b${name}(?:\\.(?:rich|raw|markup))?\\(\\s*\`[^\`]*\\$\\{`, 'g')
    dynamic += [...src.matchAll(tpl)].length
  }
}

// ── Énumérations ────────────────────────────────────────────────
// `useLabel` retombe volontairement sur le code brut quand un libellé manque,
// pour qu'un code inconnu du frontend n'empêche pas l'affichage. Le revers,
// c'est qu'un oubli au catalogue passe inaperçu : « educateur » s'affiche à la
// place d'« Éducateur/trice », sans la moindre alerte. D'où ce contrôle.
// Valeur = préfixe COMPLET de la clé : tous ces libellés ne vivent pas sous
// `enums.*` (les permissions RBAC ont leur propre domaine, par exemple).
const ENUM_GROUPS = {
  USER_ROLES: 'enums.roles',
  STAFF_TYPES: 'enums.staffTypes',
  WEEKDAYS: 'enums.weekdays',
  MEAL_SLOTS: 'enums.mealSlots',
  REPORT_TYPES: 'enums.reportTypes',
  REPORT_STATUSES: 'enums.reportStatus',
  DOMAIN_KEYS: 'enums.reportDomains',
  ARTICLE_STATUSES: 'enums.articleStatus',
  GALLERY_SOURCES: ['enums.gallerySources', 'enums.gallerySourceBadges'],
  LENDING_STATUSES: 'enums.lendingStatus',
  PERMISSION_CODES: 'rbac.permissions',
  CHILD_IMPORT_STATUSES: 'children.import.status',
}

const typesBlob = readdirSync(join(SRC, 'types'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(SRC, 'types', f), 'utf8'))
  .join('\n')

for (const [array, groups] of Object.entries(ENUM_GROUPS)) {
  const decl = typesBlob.match(
    new RegExp(`export const ${array} = \\[([\\s\\S]*?)\\] as const`),
  )
  if (!decl) {
    missing.push({ file: 'src/types', key: array, reason: 'tableau de valeurs introuvable' })
    continue
  }
  const values = [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  for (const group of [groups].flat()) {
    for (const value of values) {
      if (!catalogue.has(`${group}.${value}`)) {
        missing.push({
          file: `messages/fr/${group.split('.')[0]}.json`,
          key: `${group}.${value}`,
          reason: `valeur de ${array} sans libellé`,
        })
      }
    }
  }
}

// ── Rapport ─────────────────────────────────────────────────────
const unique = [...new Map(missing.map((m) => [`${m.file}|${m.key}`, m])).values()]

console.log(
  `[check-messages] ${catalogue.size} clés au catalogue · ` +
  `${checked} appels littéraux vérifiés · ${dynamic} dynamiques ignorés`,
)

if (unique.length > 0) {
  console.error(`\n${unique.length} clé(s) introuvable(s) :\n`)
  for (const { file, key, reason } of unique) {
    console.error(`  ${relative(ROOT, file)}\n    → ${key}  (${reason})`)
  }
  console.error(
    '\nCes clés s’afficheraient telles quelles à l’écran, sans erreur ni avertissement.\n',
  )
  process.exit(1)
}

console.log('[check-messages] aucune clé manquante.')
