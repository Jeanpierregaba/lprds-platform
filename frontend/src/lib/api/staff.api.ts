import { apiClient } from './client'
import type { Staff, StaffCreatePayload, StaffListResponse, StaffType, StaffUpdatePayload } from '@/types/staff'

export const staffApi = {
  list: (params?: {
    search?: string
    staff_type?: StaffType
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<StaffListResponse>('/api/v1/staff', { params }),

  get: (id: string) => apiClient.get<Staff>(`/api/v1/staff/${id}`),

  create: (data: StaffCreatePayload) => apiClient.post<Staff>('/api/v1/staff', data),

  update: (id: string, data: StaffUpdatePayload) =>
    apiClient.patch<Staff>(`/api/v1/staff/${id}`, data),

  resetPassword: (id: string, newPassword: string) =>
    apiClient.post<void>(`/api/v1/staff/${id}/reset-password`, { new_password: newPassword }),

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
      `/api/v1/staff/${id}/resend-invitation`,
      password ? { password } : undefined,
    ),

  setStatus: (id: string, isActive: boolean) =>
    apiClient.patch<Staff>(`/api/v1/staff/${id}/status`, { is_active: isActive }),
}
