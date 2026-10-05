import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale, type AppLocale } from '@/i18n/routing'

const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`)

/**
 * Locale applicative courante, côté NAVIGATEUR, hors composant React.
 *
 * Source unique pour les quelques modules qui doivent connaître la langue sans
 * pouvoir appeler `useLocale()` : formatage de date, repli des messages
 * d'erreur d'API, messages du hook de notifications push. Tous sont appelés
 * depuis des `catch`, des rappels asynchrones ou des fonctions de niveau
 * module, où les règles des hooks ne s'appliquent pas.
 *
 * ⚠️ **L'URL d'abord, le cookie ensuite.** Les trois modules concernés
 * lisaient uniquement le cookie, et c'était faux : avec
 * `localePrefix: 'as-needed'`, un visiteur peut parfaitement se trouver sur
 * `/en/...` SANS cookie — lien partagé, favori, cookie expiré, navigation
 * privée. Il voyait alors une interface anglaise avec des dates françaises et
 * des messages d'erreur français (constaté en recette : « JEUDI 1 OCTOBRE
 * 2026 » en tête d'un tableau de bord anglais).
 *
 * Le préfixe d'URL est ce qui a réellement décidé de la langue de la page —
 * c'est donc lui qui fait foi. Le cookie ne sert que de repli pour les URL
 * sans préfixe, qui sont celles du français.
 */
export function clientLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE

  const [, first] = window.location.pathname.split('/')
  if (isAppLocale(first)) return first

  const fromCookie = document.cookie.match(COOKIE_PATTERN)?.[1]
  return isAppLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE
}
