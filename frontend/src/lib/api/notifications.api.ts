import { apiClient } from './client'

export interface PushSubscriptionPayload {
  endpoint: string
  /** Clé publique ECDH du client, base64**url** — 87 caractères. */
  p256dh: string
  /** Secret d'authentification du client, base64**url** — 22 caractères. */
  auth_key: string
}

export interface PushSubscriptionRecord {
  id: string
  endpoint: string
  user_id: string | null
  establishment_id: string | null
  created_at: string
}

/** ⚠️ Ces appels passent par `apiClient`, jamais par `fetch` à la main.
 *
 *  La version précédente posait elle-même l'en-tête `Authorization` depuis le
 *  store, donc : aucun rafraîchissement de jeton (un abonnement tenté avec un
 *  jeton de quinze minutes expiré échouait sans recours), et surtout **aucune
 *  vérification de la réponse** — `await fetch(...)` sans lire `res.ok` fait
 *  passer un 422 pour un succès. C'est ce qui a permis à l'interface
 *  d'annoncer « notifications activées » pendant que le serveur refusait
 *  chaque appel. Axios lève sur 4xx/5xx : l'erreur ne peut plus être ignorée
 *  par omission. */
export const notificationsApi = {
  getVapidPublicKey: () =>
    apiClient.get<{ vapidPublicKey: string }>('/api/v1/notifications/vapid-public-key'),

  subscribe: (payload: PushSubscriptionPayload) =>
    apiClient.post<PushSubscriptionRecord>('/api/v1/notifications/subscriptions', payload),

  /** Retrait par ENDPOINT, la seule valeur que le navigateur sait toujours
   *  redonner (`pushManager.getSubscription()`). Idempotent côté serveur. */
  unsubscribe: (endpoint: string) =>
    apiClient.post<void>('/api/v1/notifications/subscriptions/unsubscribe', { endpoint }),

  sendTest: () =>
    apiClient.post<{ subscriptions: number; sent: number }>('/api/v1/notifications/test'),
}
