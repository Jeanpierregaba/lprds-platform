import { BLOB_REQUEST } from '@/lib/api/blob-request'
import { apiClient } from './client'
import type {
  Child, ChildCreatePayload, ChildDocument, ChildImportReportResponse, ChildListResponse,
  ChildrenExportFormat, ChildUpdatePayload,
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

  // ── Import / export (format plat XLSX / CSV, round-trip par matricule) ─
  export: (params?: { file_format?: ChildrenExportFormat; include_inactive?: boolean }) =>
    apiClient.get<Blob>('/api/v1/children/export', { ...BLOB_REQUEST, params }),

  importTemplate: (file_format: ChildrenExportFormat = 'xlsx') =>
    apiClient.get<Blob>('/api/v1/children/import/template', { ...BLOB_REQUEST, params: { file_format } }),

  import: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<ChildImportReportResponse>('/api/v1/children/import', form)
  },

  // ── Documents du dossier d'inscription ──────────────────────
  uploadDocument: (childId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<ChildDocument>(`/api/v1/children/${childId}/documents`, form)
  },

  downloadDocument: (childId: string, documentId: string) =>
    apiClient.get<Blob>(`/api/v1/children/${childId}/documents/${documentId}`, BLOB_REQUEST),

  removeDocument: (childId: string, documentId: string) =>
    apiClient.delete<void>(`/api/v1/children/${childId}/documents/${documentId}`),
}
