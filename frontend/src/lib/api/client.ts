import axios, { type AxiosError } from 'axios'

import { clientLocale } from '@/i18n/client-locale'
import { useAuthStore } from '@/lib/stores/auth.store'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10_000,
})

/**
 * Plafond des ÉCRITURES qui déclenchent du travail au-delà de la base.
 *
 * Dix secondes est juste pour une lecture — une API qui ne répond pas en dix
 * secondes est en panne — et faux pour une écriture qui, côté serveur, appelle
 * un service tiers : enregistrer un rapport attend la traduction automatique
 * de son contenu (plafonnée à 20 s par `TRANSLATION_TIMEOUT_SECONDS`), donc
 * plus longtemps que le client n'accepte d'attendre.
 *
 * ⚠️ Et le dépassement ne se lit pas comme un dépassement : sans réponse,
 * `getApiErrorMessage` affiche « Impossible de joindre le serveur » — un
 * message de PANNE sur une requête que le serveur, lui, mène à terme. Mesuré
 * sur la validation d'un rapport : `net::ERR_ABORTED` côté navigateur,
 * `statut = validated` en base, et le parent prévenu. L'admin lit un échec
 * sur une publication réussie, et son second clic reçoit un 409 qui n'a aucun
 * sens pour lui.
 *
 * Le plafond laisse donc la place au plus long travail que l'écriture puisse
 * légitimement attendre. Il reste FINI : une requête sans fin n'est pas une
 * requête, et l'utilisateur doit finir par savoir.
 */
export const WRITE_REQUEST = { timeout: 30_000 } as const

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
    // ⚠️ `_retry` se pose AUSSI sur le chemin de la file d'attente. Sans lui,
    // une requête rejouée avec le jeton frais qui reçoit malgré tout un 401
    // repasse ici, ne voit plus de renouvellement en cours, et en déclenche un
    // SECOND — avec un jeton de rafraîchissement déjà rotaté, donc révoqué.
    // L'échec de ce second appel vide la session et renvoie à l'écran de
    // connexion : la saisie en cours est perdue, et rien ne l'explique. C'est
    // le scénario de l'admin qui passe un long moment sur un rapport, puisque
    // plusieurs requêtes expirent alors ensemble — le détail du rapport, la
    // liste, le vocabulaire — et qu'une seule d'entre elles renouvelle.
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original!._retry = true
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

      // `axios.post` nu : l'instance par défaut n'a PAS nos intercepteurs (il
      // ne faut pas renouveler pendant qu'on renouvelle) — mais elle n'a pas
      // non plus notre plafond. Sans lui, un réseau qui ne répond plus laisse
      // `isRefreshing` à vrai indéfiniment : toutes les requêtes suivantes
      // s'empilent dans la file et plus rien n'aboutit ni n'échoue, l'écran
      // tourne sans fin. On le pose donc explicitement.
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshToken },
        { timeout: 10_000 }
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