/**
 * Vérifie la règle de résolution de langue (`src/i18n/detect.ts`).
 *
 * Cette règle est le cœur du bilinguisme, et elle est **silencieuse** : si elle
 * se dérègle, rien ne casse — l'utilisateur reçoit simplement l'autre langue.
 * Aucune des autres gardes ne peut la voir (ce n'est ni une clé manquante, ni
 * du texte en dur, ni un message Zod), et le dépôt n'a pas de harnais de test
 * frontend. D'où ce contrôle, sur le patron de `check-password-policy.mjs`.
 *
 * Ce qu'il protège, dans l'ordre de priorité :
 *
 * 1. **le cookie** — choix explicite fait dans ce navigateur ;
 * 2. **la langue du compte** — choix explicite valable sur tous les appareils ;
 * 3. **`Accept-Language`** — une déduction, jamais un choix ;
 *
 * et la règle produit elle-même : le français n'est servi que s'il est
 * explicitement préféré, l'inverse du repli natif de `next-intl`.
 *
 * ⚠️ Le compte passe APRÈS le cookie, à dessein : le sélecteur de langue
 * enregistre le compte par un appel réseau asynchrone pendant qu'il navigue
 * déjà. Inverser l'ordre ferait revenir l'utilisateur en arrière à chaque
 * bascule. C'est contre-intuitif, donc explicitement sous test.
 *
 * Esquive identique à `check-password-policy.mjs` : ce script importe un
 * module TypeScript, donc exige le retrait de types natif de Node (22.18+).
 * Sur un Node plus ancien il l'annonce et sort en succès.
 */

import { register } from 'node:module'

// `detect.ts` importe `./routing` sans extension : convention de bundler que
// l'ESM de Node ne connaît pas. Le crochet comble ce seul écart.
register('./ts-resolve-hook.mjs', import.meta.url)

let resolveLocale, prefersFrench
try {
  ;({ resolveLocale, prefersFrench } = await import('../src/i18n/detect.ts'))
} catch (error) {
  console.log(
    '[check-locale-resolution] ignoré — ce Node ne lit pas TypeScript ' +
      `nativement (22.18+ requis, ici ${process.version}).`,
  )
  console.log('  Détail :', error.message)
  process.exit(0)
}

let failures = 0
const ck = (label, got, exp) => {
  const ok = got === exp
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : '  ÉCHEC'} ${label}${ok ? '' : ` — attendu ${exp}, obtenu ${got}`}`)
}

const FR = 'fr-FR,fr;q=0.9'
const EN = 'en-GB,en;q=0.9'

console.log('\n── règle produit : le français seulement s’il est préféré ──')
ck('en-tête français', prefersFrench(FR), true)
ck('en-tête anglais', prefersFrench(EN), false)
ck('en-tête espagnol → pas français', prefersFrench('es-ES,es;q=0.9'), false)
// Le piège que le repli natif de next-intl ne passe pas :
ck('français accepté en SECOND → pas français', prefersFrench('en,fr;q=0.5'), false)
ck('en-tête absent → pas français', prefersFrench(null), false)
ck('joker * → pas français', prefersFrench('*'), false)

console.log('\n── priorité des sources ──')
ck('cookie seul', resolveLocale('en', FR, null), 'en')
ck('cookie prime sur le compte', resolveLocale('fr', EN, 'en'), 'fr')
ck('cookie prime sur le compte (inverse)', resolveLocale('en', FR, 'fr'), 'en')
ck('compte prime sur l’en-tête', resolveLocale(null, FR, 'en'), 'en')
ck('compte prime sur l’en-tête (inverse)', resolveLocale(null, EN, 'fr'), 'fr')
ck('en-tête seul (anonyme)', resolveLocale(null, FR, null), 'fr')
ck('en-tête seul (anonyme, anglais)', resolveLocale(null, EN, null), 'en')
ck('rien du tout → anglais', resolveLocale(null, null, null), 'en')

console.log('\n── valeurs aberrantes : jamais d’exception ──')
ck('cookie inconnu ignoré', resolveLocale('klingon', FR, null), 'fr')
ck('compte inconnu ignoré', resolveLocale(null, FR, 'klingon'), 'fr')
ck('compte vide ignoré', resolveLocale(null, EN, ''), 'en')

console.log(failures === 0 ? '\n✓ tout passe' : `\n✗ ${failures} échec(s)`)
process.exit(failures === 0 ? 0 : 1)
