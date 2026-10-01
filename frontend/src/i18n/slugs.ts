import { DEFAULT_LOCALE, type AppLocale } from './routing'

/**
 * Slugs traduits des pages PUBLIQUES.
 *
 * `/a-propos` en français, `/en/about` en anglais — plutôt que `/en/a-propos`,
 * qui donne une URL mi-anglaise mi-française à la seule partie du site qu'un
 * visiteur partage, met en favori, et qu'un moteur indexe.
 *
 * ## Pourquoi pas `pathnames` de next-intl
 *
 * C'est le mécanisme prévu pour ça, et il a été écarté sciemment. Déclarer
 * `pathnames` rend le typage de `href` **strict pour toute l'application** :
 * il faudrait énumérer les 56 routes (espaces connectés compris) et convertir
 * les 61 `href` dynamiques en `{pathname, params}`. Cent cinquante points
 * d'appel touchés, dont la totalité de l'espace connecté, pour six URL
 * publiques — et autant d'occasions de casser un lien là où personne ne
 * réclamait rien.
 *
 * La contrepartie assumée : ce mécanisme-ci est propre au projet, donc il faut
 * y penser. `check-marketing-slugs.mjs` s'en charge — il échoue si une page
 * publique est liée sans passer par `marketingPath`, ou si une entrée de cette
 * carte ne correspond à aucune route réelle.
 *
 * ## Ce que la carte ne contient pas
 *
 * L'espace connecté : `/en/dashboard/admin` convient très bien. Ces URL ne se
 * partagent pas, ne s'indexent pas, et traduire `dashboard` n'apporterait rien
 * à personne.
 */
export const MARKETING_SLUGS: Record<string, Partial<Record<AppLocale, string>>> = {
  '/a-propos':         { en: '/about' },
  '/nos-sections':     { en: '/our-groups' },
  '/galerie':          { en: '/gallery' },
  '/actualites':       { en: '/news' },
  '/contact':          { en: '/contact' },
  '/mentions-legales': { en: '/legal-notice' },
  '/confidentialite':  { en: '/privacy' },
}

/** Carte inverse, construite une fois : slug servi → chemin de route réel. */
const BY_LOCALIZED: Record<string, Record<string, string>> = {}
for (const [bare, perLocale] of Object.entries(MARKETING_SLUGS)) {
  for (const [locale, slug] of Object.entries(perLocale)) {
    ;(BY_LOCALIZED[locale] ??= {})[slug] = bare
  }
}

/**
 * Chemin NU à donner à `<Link>` pour cette langue — sans préfixe de locale,
 * que `next-intl` ajoute ensuite lui-même.
 *
 * `marketingPath('/a-propos', 'en')` → `/about`, que `<Link>` rendra
 * `/en/about`. En français, le chemin est rendu inchangé.
 *
 * Un chemin absent de la carte (une sous-page d'actualité, une route de
 * l'espace connecté) traverse tel quel : la fonction est sûre à appeler
 * partout.
 */
export function marketingPath(bare: string, locale: string): string {
  if (locale === DEFAULT_LOCALE) return bare
  return MARKETING_SLUGS[bare]?.[locale as AppLocale] ?? bare
}

/**
 * L'inverse : slug reçu dans l'URL → chemin de la route réelle sur le disque.
 *
 * Utilisé par le middleware, qui doit retrouver `/a-propos` (le dossier qui
 * existe) derrière `/about` pour pouvoir réécrire la requête.
 */
export function routePathFor(localized: string, locale: string): string {
  if (locale === DEFAULT_LOCALE) return localized
  return BY_LOCALIZED[locale]?.[localized] ?? localized
}

/** Le chemin nu a-t-il un slug propre à cette langue ? */
export function hasLocalizedSlug(bare: string, locale: string): boolean {
  return marketingPath(bare, locale) !== bare
}
