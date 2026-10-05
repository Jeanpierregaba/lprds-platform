/**
 * Résolution de la langue — règle produit explicite.
 *
 * « FR si l'appareil est en français, EN si l'appareil est en anglais ou dans
 * TOUTE autre langue. » C'est l'inverse du repli natif de `next-intl`, qui
 * retombe sur la locale par défaut (le français) dès qu'il ne reconnaît pas la
 * langue demandée — un visiteur dont le navigateur est en espagnol verrait
 * alors du français. D'où cette résolution maison, appelée par le middleware.
 *
 * Priorité : cookie explicite > langue du COMPTE > en-tête `Accept-Language`
 * > anglais. (Un préfixe d'URL, lui, l'emporte sur tout : il est traité en
 * amont par le middleware.)
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
 *
 * Trois sources, dans cet ordre :
 *
 * 1. **le cookie** — choix explicite fait DANS CE NAVIGATEUR, par le sélecteur
 *    de langue ;
 * 2. **`accountLocale`** (`users.locale`, lu dans le cookie de session) —
 *    choix explicite fait sur le COMPTE, qui vaut sur tous les appareils ;
 * 3. **`Accept-Language`** — une déduction, jamais un choix.
 *
 * ⚠️ Le compte passe après le cookie, et non avant, bien que ce soit la source
 * de vérité côté backend. Le sélecteur enregistre le compte par un appel
 * réseau asynchrone *pendant* qu'il navigue déjà vers la nouvelle langue :
 * faire primer le compte renverrait l'utilisateur d'où il vient à chaque
 * bascule, le temps que l'appel aboutisse — et définitivement s'il échoue (il
 * est best-effort par choix). Le cookie, lui, est écrit immédiatement.
 *
 * Ce que le compte corrige, c'est l'absence de cookie : cookies effacés,
 * nouvel appareil, navigation privée. Jusqu'ici on retombait alors sur
 * `Accept-Language`, c'est-à-dire qu'une préférence explicitement enregistrée
 * cédait devant un réglage de navigateur — et l'interface pouvait s'afficher
 * en français pendant que l'API, qui obéit au compte, répondait en anglais.
 */
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
  accountLocale?: string | null,
): AppLocale {
  if (isAppLocale(cookieValue)) return cookieValue
  if (isAppLocale(accountLocale)) return accountLocale
  return prefersFrench(acceptLanguage) ? DEFAULT_LOCALE : 'en'
}
