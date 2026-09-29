import type { MetadataRoute } from 'next'

import { localePath } from '@/i18n/metadata'
import { LOCALES } from '@/i18n/routing'
import { MARKETING_NAV } from '@/lib/marketing/data'

/**
 * Plan du site — pages publiques uniquement.
 *
 * L'espace connecté en est volontairement absent : il est protégé par le
 * middleware, n'a aucune valeur de référencement, et y exposer l'arborescence
 * des routes d'administration serait gratuitement bavard.
 *
 * Chaque URL déclare ses variantes linguistiques, en écho aux balises
 * `hreflang` posées par les pages elles-mêmes (cf. `src/i18n/metadata.ts`).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Pages publiques absentes de la navigation principale (liens de pied de page).
const EXTRA_PATHS = ['/mentions-legales', '/confidentialite']

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...MARKETING_NAV.map((item) => item.href), ...EXTRA_PATHS]
  const lastModified = new Date()

  return paths.flatMap((path) => {
    const languages = Object.fromEntries(
      LOCALES.map((locale) => [locale, `${SITE_URL}${localePath(path, locale)}`]),
    )

    return LOCALES.map((locale) => ({
      url: `${SITE_URL}${localePath(path, locale)}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.7,
      alternates: { languages },
    }))
  })
}
