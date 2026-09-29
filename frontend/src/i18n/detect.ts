/**
 * Résolution de la langue — règle produit explicite.
 *
 * « FR si l'appareil est en français, EN si l'appareil est en anglais ou dans
 * TOUTE autre langue. » C'est l'inverse du repli natif de `next-intl`, qui
 * retombe sur la locale par défaut (le français) dès qu'il ne reconnaît pas la
 * langue demandée — un visiteur dont le navigateur est en espagnol verrait
 * alors du français. D'où cette résolution maison, appelée par le middleware.
 *
 * Priorité : cookie explicite > en-tête `Accept-Language` > anglais.
 * (Pour un utilisateur connecté, `users.locale` prime encore au-dessus — la
 * synchronisation se fait côté client via le sélecteur de langue.)
 */
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from './routing'

/**
 * Vrai si l'en-tête `Accept-Language` exprime une préférence francophone.
 * On compare sur la sous-balise de langue uniquement : `fr`, `fr-FR`, `fr-CA`
 * et `fr-BE` comptent tous comme du français.
 */
export function prefersFrench(acceptLanguage: string | null | undefined): boolean {
  if (!acceptLanguage) return false

  // « fr-CA,fr;q=0.9,en;q=0.8 » → [{ tag: 'fr-ca', q: 1 }, …], trié par q décroissant.
  const entries = acceptLanguage
    .split(',')
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(';')
      const qParam = params.find((p) => p.trim().startsWith('q='))
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1
      return { tag: (rawTag ?? '').trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 }
    })
    .filter((entry) => entry.tag.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q)

  // Seule la préférence la MIEUX notée décide : un navigateur anglais qui
  // accepte le français en repli (« en, fr;q=0.5 ») doit rester en anglais.
  const best = entries[0]
  if (!best) return false
  if (best.tag === '*') return false

  return best.tag === 'fr' || best.tag.startsWith('fr-')
}

/**
 * Locale à servir à une requête qui ne porte pas encore de préfixe d'URL.
 * `cookieValue` l'emporte : c'est un choix explicite du visiteur.
 */
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): AppLocale {
  if (isAppLocale(cookieValue)) return cookieValue
  return prefersFrench(acceptLanguage) ? DEFAULT_LOCALE : 'en'
}
