import { BLOB_REQUEST } from '@/lib/api/blob-request'
import { apiClient } from './client'
import type {
  DepartmentReportTypeSetting, MissingReportResponse, ParentReportDetail, ParentReportListResponse, Report,
  ReportCreatePayload, ReportListResponse,
  ReportStatus, ReportType, ReportUpdatePayload, ReportVocabulary, ReportAttachment,
} from '@/types/reports'

export const reportsApi = {
  // ── Paramètres département ──────────────────────────────────
  listDepartmentReportTypes: (departmentId: string) =>
    apiClient.get<DepartmentReportTypeSetting[]>(`/api/v1/reports/settings/departments/${departmentId}/types`),

  assignDepartmentReportType: (departmentId: string, reportType: ReportType) =>
    apiClient.post<void>(`/api/v1/reports/settings/departments/${departmentId}/types/${reportType}`),

  unassignDepartmentReportType: (departmentId: string, reportType: ReportType) =>
    apiClient.delete<void>(`/api/v1/reports/settings/departments/${departmentId}/types/${reportType}`),

  // ── Vocabulaire ──────────────────────────────────────────────
  getVocabulary: () => apiClient.get<ReportVocabulary>('/api/v1/reports/vocabulary'),

  // ── Rapports ─────────────────────────────────────────────────
  list: (params?: {
    status?: ReportStatus
    report_type?: ReportType
    child_id?: string
    group_id?: string
    search?: string
    skip?: number
    limit?: number
  }) => apiClient.get<ReportListResponse>('/api/v1/reports', { params }),

  listMissing: (params?: {
    report_type?: ReportType
    date?: string
    department_id?: string
    section_id?: string
    group_id?: string
  }) => apiClient.get<MissingReportResponse>('/api/v1/reports/missing', { params }),

  get: (id: string) => apiClient.get<Report>(`/api/v1/reports/${id}`),

  create: (data: ReportCreatePayload) => apiClient.post<Report>('/api/v1/reports', data),

  update: (id: string, data: ReportUpdatePayload) => apiClient.patch<Report>(`/api/v1/reports/${id}`, data),

  remove: (id: string) => apiClient.delete<void>(`/api/v1/reports/${id}`),

  submit: (id: string) => apiClient.post<Report>(`/api/v1/reports/${id}/submit`),

  validate: (id: string) => apiClient.post<Report>(`/api/v1/reports/${id}/validate`),

  reject: (id: string, reason: string) => apiClient.post<Report>(`/api/v1/reports/${id}/reject`, { reason }),

  uploadAttachment: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<ReportAttachment>(`/api/v1/reports/${id}/attachments`, form)
  },

  downloadAttachment: (reportId: string, attachmentId: string, thumb = false) =>
    apiClient.get<Blob>(`/api/v1/reports/${reportId}/attachments/${attachmentId}`,
      { ...BLOB_REQUEST, params: thumb ? { thumb: true } : undefined }),

  deleteAttachment: (reportId: string, attachmentId: string) =>
    apiClient.delete<void>(`/api/v1/reports/${reportId}/attachments/${attachmentId}`),

  // ── Portail parent ───────────────────────────────────────────
  listMine: (params?: { child_id?: string; skip?: number; limit?: number }) =>
    apiClient.get<ParentReportListResponse>('/api/v1/reports/mine/list', { params }),

  getMine: (id: string) => apiClient.get<ParentReportDetail>(`/api/v1/reports/mine/${id}`),

  markMineRead: (id: string) => apiClient.post<void>(`/api/v1/reports/mine/${id}/read`),

  downloadMineAttachment: (reportId: string, attachmentId: string, thumb = false) =>
    apiClient.get<Blob>(`/api/v1/reports/mine/${reportId}/attachments/${attachmentId}`,
      { ...BLOB_REQUEST, params: thumb ? { thumb: true } : undefined }),

  downloadMinePdf: (id: string) =>
    apiClient.get<Blob>(`/api/v1/reports/mine/${id}/pdf`, BLOB_REQUEST),
}
