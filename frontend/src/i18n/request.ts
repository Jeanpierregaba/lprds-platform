/**
 * Chargement des messages côté serveur, par requête.
 *
 * Les catalogues vivent dans `messages/<locale>/<domaine>.json`, un fichier par
 * module métier, agrégés par `messages/<locale>/index.ts`. Un seul gros JSON
 * par langue serait vite illisible à l'échelle du projet (~1 500 chaînes) et
 * rendrait toute relecture de diff pénible ; le découpage par domaine garde
 * chaque fichier à taille humaine et cantonne les conflits de fusion au module
 * réellement touché.
 */
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` vient du segment [locale] de l'URL — il peut être absent
  // ou invalide si la route est atteinte hors du routage normal.
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  const { messages } = await import(`../../messages/${locale}`)

  return { locale, messages }
})
