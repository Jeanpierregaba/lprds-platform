/**
 * Configuration de routage i18n — source de vérité unique des locales.
 *
 * `localePrefix: 'as-needed'` : le français, locale par défaut, garde les URL
 * historiques (`/a-propos`, `/dashboard/admin`) ; l'anglais prend un préfixe
 * (`/en/a-propos`). Aucun lien existant, favori ou référencement ne casse, et
 * les pages anglaises restent indexables séparément (cf. hreflang).
 *
 * ⚠️ La détection automatique de `next-intl` est volontairement DÉSACTIVÉE.
 * Son comportement natif retombe sur `defaultLocale` (donc le français) pour
 * toute langue qu'elle ne reconnaît pas, alors que la règle produit est
 * l'inverse : français si l'appareil est en français, anglais pour TOUTE autre
 * langue. La résolution est faite explicitement par `resolveLocale()`
 * (cf. `src/i18n/detect.ts`), appelée depuis le middleware.
 */
import { defineRouting } from 'next-intl/routing'

export const LOCALES = ['fr', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'fr'

/** Mémorise le choix explicite d'un visiteur anonyme. Pour un compte connecté,
 *  c'est `users.locale` qui fait foi (le cookie n'est qu'un miroir). */
export const LOCALE_COOKIE = 'NEXT_LOCALE'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 an

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: LOCALE_COOKIE_MAX_AGE,
  },
})
