import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/i18n/routing'
import { clientLocale } from '@/i18n/client-locale'

/**
 * Étiquette de locale pour `Intl` et les méthodes `toLocale*String`.
 *
 * Les formateurs de date du projet sont presque tous de petites fonctions
 * déclarées au niveau module (`function formatDate(iso) { … }`), appelées
 * depuis le rendu. Les convertir en hooks imposerait de remonter la
 * traduction dans chaque composant appelant — pour un formatage de date. La
 * langue vient donc de `clientLocale()` (préfixe d'URL, puis cookie), comme
 * pour `getApiErrorMessage`.
 *
 * ⚠️ `en-GB` et non `en-US` : l'ordre jour-mois-année reste celui du français,
 * ce qui évite qu'un parent lisant les deux versions confonde 03/04 et 04/03.
 * C'est un choix produit, pas une contrainte technique.
 */
const INTL_TAGS: Record<AppLocale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
}

/** Locale applicative courante, côté navigateur. Retombe sur le français au
 *  rendu serveur, où ni l'URL ni le cookie ne sont lisibles depuis ce module —
 *  les pages serveur qui affichent des dates doivent passer par `getLocale()`. */
export function uiLocale(): AppLocale {
  return clientLocale()
}

/** Étiquette à passer à `Intl` / `toLocaleDateString` / `toLocaleString`. */
export function intlLocale(): string {
  return INTL_TAGS[uiLocale()]
}

/** Étiquette `Intl` correspondant à une locale applicative connue — pour les
 *  composants serveur, qui obtiennent la leur via `getLocale()`. */
export function intlLocaleFor(locale: string): string {
  return isAppLocale(locale) ? INTL_TAGS[locale] : INTL_TAGS[DEFAULT_LOCALE]
}
