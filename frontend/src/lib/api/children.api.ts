import { apiClient } from './client'
import type { Child, ChildCreatePayload, ChildListResponse, ChildUpdatePayload } from '@/types/children'

export const childrenApi = {
  // ── Portail staff : « Mon Groupe » (hors RBAC) ──────────────
  listMyGroup: () => apiClient.get<ChildListResponse>('/api/v1/children/my-group'),

  list: (params?: {
    search?: string
    department_id?: string
    section_id?: string
    unassigned_only?: boolean
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<ChildListResponse>('/api/v1/children', { params }),

  get: (id: string) => apiClient.get<Child>(`/api/v1/children/${id}`),

  create: (data: ChildCreatePayload) => apiClient.post<Child>('/api/v1/children', data),

  update: (id: string, data: ChildUpdatePayload) =>
    apiClient.patch<Child>(`/api/v1/children/${id}`, data),

  setStatus: (id: string, isActive: boolean) =>
    apiClient.patch<Child>(`/api/v1/children/${id}/status`, { is_active: isActive }),
}
