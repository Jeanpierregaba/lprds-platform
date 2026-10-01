/**
 * Vérifie la politique de mot de passe partagée (`lib/validation/password.ts`).
 *
 * Contrairement aux trois gardes i18n, ce script n'est PAS dans `pnpm lint` :
 * il s'appuie sur le retrait de types natif de Node (sans drapeau à partir de
 * 22.18 / 23.6, mais `--experimental-strip-types` avant), et le dépôt ne fixe
 * aucun `engines`. Le câbler au lint échangerait un risque silencieux contre un
 * pipeline qui casse selon la version de Node de la machine.
 *
 * À lancer donc au moment où il compte — **toute montée de version de Zod** :
 *
 *   pnpm check-password-policy
 *
 * Ce qu'il protège : `passwordConfirmation()` pose son `.refine()` sur un
 * `ZodObject`, et l'onglet profil y ajoute `current_password` par `.extend()`.
 * Que le raffinement survive à cette extension est un comportement de Zod 4 ;
 * en Zod 3 il était perdu **sans erreur**. S'il repart, la confirmation du mot
 * de passe cesse d'être contrôlée et rien ne le signale.
 */

import { z } from 'zod'
import { passwordConfirmation } from '../src/lib/validation/password.ts'
import fr from '../messages/fr/auth.json' with { type: 'json' }
import en from '../messages/en/auth.json' with { type: 'json' }

const translator = (cat: Record<string, Record<string, string>>) =>
  (key: string) => {
    const [a, b] = key.split('.')
    const v = cat[a]?.[b]
    if (v === undefined) throw new Error(`clé absente: ${key}`)
    return v
  }

let failures = 0
const ck = (label: string, got: unknown, exp: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : '  ÉCHEC'} ${label}${ok ? '' : ` — attendu ${JSON.stringify(exp)}, obtenu ${JSON.stringify(got)}`}`)
}

const firstError = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value)
  if (r.success) return null
  const i = r.error.issues[0]
  return `${i.path.join('.')}: ${i.message}`
}

for (const [locale, cat] of [['fr', fr], ['en', en]] as const) {
  const t = translator(cat as never)
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
