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
