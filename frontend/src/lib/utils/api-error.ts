import { AxiosError } from 'axios'

import en from '../../../messages/en/errors.json'
import fr from '../../../messages/fr/errors.json'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale } from '@/i18n/routing'

const LOCALE_PATTERN = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`)

/**
 * Message affichable à partir d'une erreur d'API.
 *
 * Deux sources, dans cet ordre :
 *  1. le `detail` renvoyé par le backend, repris tel quel — c'est lui qui
 *     porte le message métier précis, et il arrive déjà dans la langue de
 *     l'utilisateur (le backend le traduit d'après `users.locale`) ;
 *  2. à défaut, un repli générique selon le code HTTP, traduit ici.
 *
 * ⚠️ Cette fonction n'est délibérément PAS un hook, alors que tout le reste de
 * la traduction passe par `useTranslations`. Elle est appelée 163 fois dans
 * 48 fichiers, souvent dans des `catch` et des rappels asynchrones où les
 * règles des hooks ne s'appliquent pas. La convertir imposerait de réécrire
 * tous ces appels pour huit chaînes de repli. La langue est donc lue
 * directement dans le cookie, et les textes viennent des mêmes catalogues que
 * partout ailleurs — une seule source de vérité, pas de doublon.
 */

const CATALOGS = { fr, en } as const

function currentLocale() {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie.match(LOCALE_PATTERN)
  const value = match?.[1]
  return isAppLocale(value) ? value : DEFAULT_LOCALE
}

export function getApiErrorMessage(error: unknown): string {
  const t = CATALOGS[currentLocale()]

  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((e: { msg: string }) => e.msg).join(' · ')
    }
    if (error.response?.status === 422) return t.invalidData
    if (error.response?.status === 401) return t.badCredentials
    if (error.response?.status === 403) return t.forbidden
    if (error.response?.status === 500) return t.serverError
    if (!error.response) return t.unreachable
  }
  return t.unexpected
}
