/**
 * Balises `hreflang` et URL canoniques.
 *
 * `next-intl` gère le routage mais ne produit pas ces balises : sans elles,
 * Google traite `/a-propos` et `/en/about` comme deux pages sans rapport, voire
 * comme du contenu dupliqué, au lieu de deux versions linguistiques de la même
 * page. C'est précisément le bénéfice SEO qui justifiait de préfixer l'anglais
 * plutôt que de tout garder dans un cookie.
 *
 * `x-default` pointe vers le français : c'est la version servie à un moteur ou
 * à un visiteur dont on ne sait pas déduire la langue.
 */
import { DEFAULT_LOCALE, LOCALES } from './routing'

/** Chemin réellement servi pour une locale, en mode `as-needed`. */
export function localePath(path: string, locale: string): string {
  if (locale === DEFAULT_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/**
 * Bloc `alternates` à poser dans le `generateMetadata` d'une page publique.
 * `path` est le chemin NU, sans préfixe de langue (ex. `/a-propos`).
 */
export function localeAlternates(path: string, locale: string) {
  const languages = Object.fromEntries(
    LOCALES.map((l) => [l, localePath(path, l)]),
  )

  return {
    canonical: localePath(path, locale),
    languages: { ...languages, 'x-default': localePath(path, DEFAULT_LOCALE) },
  }
}
