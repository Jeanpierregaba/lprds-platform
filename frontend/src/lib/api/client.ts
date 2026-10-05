import axios, { type AxiosError } from 'axios'

import { clientLocale } from '@/i18n/client-locale'
import { useAuthStore } from '@/lib/stores/auth.store'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10_000,
})

// Injecte le token JWT et la langue courante à chaque requête.
//
// `Accept-Language` sert aux réponses immédiates (messages d'erreur, documents
// générés à la demande). Pour tout ce qui part hors navigateur — emails,
// notifications push — c'est `users.locale` qui fait foi côté backend :
// l'en-tête n'existe pas au moment d'un envoi différé.
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`

  const locale = requestLocale()
  if (locale) config.headers['Accept-Language'] = locale

  return config
})

/**
 * Langue annoncée au backend. Côté serveur (rendu, tests unitaires), il n'y a
 * ni URL ni cookie : aucun en-tête n'est envoyé et le backend applique sa
 * propre résolution.
 *
 * ⚠️ Passe par `clientLocale()`, qui lit le PRÉFIXE D'URL avant le cookie. Ce
 * module lisait le cookie seul, et c'était le plus coûteux des quatre endroits
 * qui le faisaient : sur `/en/...` sans cookie, chaque requête annonçait
 * `Accept-Language: fr` et le backend renvoyait ses messages d'erreur en
 * français au beau milieu d'une interface anglaise.
 *
 * Rappel : pour un compte connecté, `users.locale` prime de toute façon sur
 * cet en-tête côté backend (cf. claude.md, § Internationalisation). L'en-tête
 * ne décide donc que pour les appels non authentifiés — login, reset de mot de
 * passe, site vitrine — c'est-à-dire précisément ceux qu'un visiteur fait
 * avant d'avoir le moindre cookie.
 */
function requestLocale(): string | null {
  if (typeof window === 'undefined') return null
  return clientLocale()
}

// Refresh automatique sur 401
let isRefreshing = false
let queue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean }

    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error)
    }

    // Si un refresh est déjà en cours, mettre en file d'attente
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original!.headers!.Authorization = `Bearer ${token}`
          resolve(apiClient(original!))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshToken }
      )

      useAuthStore.getState().setSession(data, useAuthStore.getState().user!)
      queue.forEach((cb) => cb(data.access_token))
      queue = []

      original!.headers!.Authorization = `Bearer ${data.access_token}`
      return apiClient(original!)
    } catch {
      useAuthStore.getState().clearSession()
      window.location.href = '/auth/login'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)