import { apiClient } from './client'
import type {
  Child, ChildCreatePayload, ChildDocument, ChildListResponse, ChildUpdatePayload,
} from '@/types/children'

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

  // ── Documents du dossier d'inscription ──────────────────────
  uploadDocument: (childId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<ChildDocument>(`/api/v1/children/${childId}/documents`, form)
  },

  downloadDocument: (childId: string, documentId: string) =>
    apiClient.get<Blob>(`/api/v1/children/${childId}/documents/${documentId}`, { responseType: 'blob' }),

  removeDocument: (childId: string, documentId: string) =>
    apiClient.delete<void>(`/api/v1/children/${childId}/documents/${documentId}`),
}
