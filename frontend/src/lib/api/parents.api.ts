import { apiClient } from './client'
import type {
  Parent, ParentChildBrief, ParentCreatePayload, ParentListResponse, ParentUpdatePayload,
} from '@/types/parents'

export const parentsApi = {
  // ── Portail parent ───────────────────────────────────────────
  listMyChildren: () => apiClient.get<ParentChildBrief[]>('/api/v1/parents/me/children'),

  list: (params?: {
    search?: string
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<ParentListResponse>('/api/v1/parents', { params }),

  get: (id: string) => apiClient.get<Parent>(`/api/v1/parents/${id}`),

  create: (data: ParentCreatePayload) => apiClient.post<Parent>('/api/v1/parents', data),

  update: (id: string, data: ParentUpdatePayload) =>
    apiClient.patch<Parent>(`/api/v1/parents/${id}`, data),

  resetPassword: (id: string, newPassword: string) =>
    apiClient.post<void>(`/api/v1/parents/${id}/reset-password`, { new_password: newPassword }),

  /** Renvoie l'email de bienvenue avec un mot de passe NEUF.
   *
   * ⚠️ **Aucun mot de passe en réponse**, jamais : un secret généré par la
   * plateforme ne traverse pas une réponse HTTP, et celui d'origine est
   * irrécupérable (bcrypt côté serveur). `password` est donc le seul moyen de
   * pouvoir transmettre les accès autrement que par email — l'admin le
   * choisit, donc son écran peut le lui faire copier. Omis, un mot de passe
   * est généré et n'existera que dans l'email. */
  resendInvitation: (id: string, password?: string) =>
    apiClient.post<void>(
      `/api/v1/parents/${id}/resend-invitation`,
      password ? { password } : undefined,
    ),
}
