import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale, type AppLocale } from '@/i18n/routing'

/**
 * Étiquette de locale pour `Intl` et les méthodes `toLocale*String`.
 *
 * Les formateurs de date du projet sont presque tous de petites fonctions
 * déclarées au niveau module (`function formatDate(iso) { … }`), appelées
 * depuis le rendu. Les convertir en hooks imposerait de remonter la
 * traduction dans chaque composant appelant — pour un formatage de date. La
 * langue est donc lue dans le cookie, comme pour `getApiErrorMessage`.
 *
 * ⚠️ `en-GB` et non `en-US` : l'ordre jour-mois-année reste celui du français,
 * ce qui évite qu'un parent lisant les deux versions confonde 03/04 et 04/03.
 * C'est un choix produit, pas une contrainte technique.
 */
const INTL_TAGS: Record<AppLocale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
}

const LOCALE_PATTERN = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`)

/** Locale applicative courante, côté navigateur. Retombe sur le français au
 *  rendu serveur, où le cookie n'est pas lisible depuis ce module — les pages
 *  serveur qui affichent des dates doivent passer par `getLocale()`. */
export function uiLocale(): AppLocale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const value = document.cookie.match(LOCALE_PATTERN)?.[1]
  return isAppLocale(value) ? value : DEFAULT_LOCALE
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
