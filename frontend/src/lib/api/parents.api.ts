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
   * ⚠️ Aucun corps, et aucun mot de passe en réponse : il ne doit exister que
   * dans l'email. Celui d'origine est irrécupérable (bcrypt côté serveur). */
  resendInvitation: (id: string) =>
    apiClient.post<void>(`/api/v1/parents/${id}/resend-invitation`),
}
