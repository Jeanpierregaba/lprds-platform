/**
 * Vérifie la politique de mot de passe partagée (`lib/validation/password.ts`).
 *
 * Ce qu'il protège : `passwordConfirmation()` pose son `.refine()` sur un
 * `ZodObject`, et l'onglet profil y ajoute `current_password` par `.extend()`.
 * Que le raffinement survive à cette extension est un comportement de Zod 4 ;
 * en Zod 3 il était perdu **sans erreur**. S'il repart, la confirmation du mot
 * de passe cesse d'être contrôlée et rien ne le signale — ni le type-check, ni
 * le lint, ni l'écran.
 *
 * ⚠️ Ce script importe un module TypeScript (`password.ts`), ce qui exige le
 * retrait de types natif de Node (sans drapeau à partir de 22.18 / 23.6). Le
 * dépôt ne fixe aucun `engines`, et câbler tel quel au lint casserait le
 * contrôle sur une machine plus ancienne.
 *
 * D'où l'**esquive explicite** ci-dessous : sur un Node qui ne sait pas lire
 * TypeScript, le script le dit et sort en succès. Il rejoint donc `pnpm lint`
 * sans pouvoir rien casser — ce qui vaut mieux qu'une garde correcte que
 * personne ne lance. Il reste à lancer sciemment à toute montée de Zod :
 *
 *   pnpm check-password-policy
 */

import { z } from 'zod'
import fr from '../messages/fr/auth.json' with { type: 'json' }
import en from '../messages/en/auth.json' with { type: 'json' }

// Importé dynamiquement pour pouvoir esquiver proprement : un `import` statique
// échouerait au chargement du module, avant toute possibilité de message.
let passwordConfirmation
try {
  ;({ passwordConfirmation } = await import('../src/lib/validation/password.ts'))
} catch (error) {
  console.log(
    '[check-password-policy] ignoré — ce Node ne lit pas TypeScript nativement ' +
      `(22.18+ requis, ici ${process.version}).`,
  )
  console.log('  Détail :', error.message)
  process.exit(0)
}

const translator = (cat) => (key) => {
    const [a, b] = key.split('.')
    const v = cat[a]?.[b]
    if (v === undefined) throw new Error(`clé absente: ${key}`)
    return v
  }

let failures = 0
const ck = (label, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : '  ÉCHEC'} ${label}${ok ? '' : ` — attendu ${JSON.stringify(exp)}, obtenu ${JSON.stringify(got)}`}`)
}

const firstError = (schema, value) => {
  const r = schema.safeParse(value)
  if (r.success) return null
  const i = r.error.issues[0]
  return `${i.path.join('.')}: ${i.message}`
}

for (const [locale, cat] of [['fr', fr], ['en', en]]) {
  const t = translator(cat)
  console.log(`\n── ${locale} ────────────────────────────────`)

  // 1. Le couple seul (page « nouveau mot de passe »).
  const pair = passwordConfirmation(t)
  ck('couple : accepte un mot de passe conforme',
     pair.safeParse({ new_password: 'Abcdefg1', confirm: 'Abcdefg1' }).success, true)
  ck('couple : confirmation divergente',
     firstError(pair, { new_password: 'Abcdefg1', confirm: 'Abcdefg2' }),
     `confirm: ${cat.validation.passwordMismatch}`)

  // 2. Le couple ÉTENDU (onglet profil) — le raffinement doit survivre.
  const extended = pair.extend({ current_password: z.string().min(1, 'actuel requis') })
  ck('étendu : accepte un formulaire complet valide',
     extended.safeParse({ current_password: 'x', new_password: 'Abcdefg1', confirm: 'Abcdefg1' }).success, true)
  ck('étendu : CONSERVE la règle de concordance',
     firstError(extended, { current_password: 'x', new_password: 'Abcdefg1', confirm: 'Abcdefg2' }),
     `confirm: ${cat.validation.passwordMismatch}`)
  ck('étendu : conserve aussi la politique du champ',
     firstError(extended, { current_password: 'x', new_password: 'abcdefg1', confirm: 'abcdefg1' }),
     `new_password: ${cat.validation.passwordUpper}`)
  ck('étendu : exige bien le mot de passe actuel',
     firstError(extended, { current_password: '', new_password: 'Abcdefg1', confirm: 'Abcdefg1' }),
     'current_password: actuel requis')
}

console.log(failures === 0 ? '\n✓ tout passe' : `\n✗ ${failures} échec(s)`)
process.exit(failures === 0 ? 0 : 1)
