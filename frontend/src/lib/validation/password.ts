import { z } from 'zod'

/** Signature minimale d'un traducteur next-intl. */
type T = (key: string) => string

/**
 * Politique de mot de passe de la plateforme — **source unique côté frontend**.
 *
 * Miroir exact de `StrongPassword` (`backend/app/modules/auth/schemas.py`) :
 * 8 caractères minimum, au moins une majuscule, au moins un chiffre. Le
 * backend reste l'autorité — il revalide tout — mais les deux doivent dire la
 * même chose, sinon l'utilisateur se fait refuser par l'API un mot de passe
 * que le formulaire venait d'accepter.
 *
 * Cette règle était recopiée à l'identique dans huit formulaires (création et
 * réinitialisation du personnel, des parents, des administrateurs
 * d'établissement, premier mot de passe, profil). Huit copies d'une règle de
 * sécurité, c'est huit occasions de la durcir à sept endroits sur huit.
 *
 * Le traducteur attendu est celui du domaine **`auth`**, où vivent désormais
 * les trois seuls libellés de la politique :
 *
 * ```ts
 * const tAuth = useTranslations('auth')
 * // …
 * resolver: zodResolver(makeSchema(t, tAuth))
 * ```
 */
export const passwordField = (tAuth: T) =>
  z.string()
    .min(8, tAuth('validation.passwordMin'))
    .regex(/[A-Z]/, tAuth('validation.passwordUpper'))
    .regex(/[0-9]/, tAuth('validation.passwordDigit'))

/**
 * Couple « nouveau mot de passe + confirmation », règle de concordance incluse.
 *
 * Le champ `confirm` n'a aucune contrainte propre : c'est le `.refine()` au
 * niveau de l'objet qui porte la règle, avec `path: ['confirm']` pour que
 * l'erreur s'affiche sous le second champ et non sous le premier.
 *
 * Étendre le schéma avec des champs supplémentaires se fait par `.extend()` :
 *
 * ```ts
 * passwordConfirmation(tAuth).extend({
 *   current_password: z.string().min(1, t('settings.currentPasswordRequired')),
 * })
 * ```
 *
 * ⚠️ Cela repose sur un comportement précis de **Zod 4** : un `.refine()` posé
 * sur un `ZodObject` rend un `ZodObject`, et le raffinement **survit** au
 * `.extend()` qui suit (vérifié à l'exécution sur 4.4.3 — en Zod 3 il aurait
 * été perdu, silencieusement). À revérifier lors d'une montée de version
 * majeure : si le raffinement disparaît, la confirmation cesse d'être
 * contrôlée sans que rien n'échoue. `pnpm check-password-policy` le vérifie.
 */
export const passwordConfirmation = (tAuth: T) =>
  z.object({
    new_password: passwordField(tAuth),
    confirm: z.string(),
  }).refine((d) => d.new_password === d.confirm, {
    message: tAuth('validation.passwordMismatch'),
    path: ['confirm'],
  })
