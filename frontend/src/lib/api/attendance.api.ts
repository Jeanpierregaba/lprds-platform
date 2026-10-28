import { BLOB_REQUEST } from '@/lib/api/file-transfer'
import { apiClient } from './client'
import type {
  AbsenceInquiryResponse, AttendanceEvent, AttendanceEventListResponse, AttendanceGeneralSettings, AttendanceGeneralSettingsPayload,
  AttendanceSettingsPayload, ChildDailyStatusListResponse, DepartmentAttendanceSettings, EventType,
  Exemption, ExemptionCreatePayload, ExemptionListResponse, ExemptionScope, ExemptionUpdatePayload,
  ManualEventPayload, PersonType, QRCodeResponse, StaffDailyStatusListResponse, StaffSchedule,
  AttendanceExportParams, UpdateEventPayload,
  VerifyQrResponse,
} from '@/types/attendance'

export const attendanceApi = {
  getChildQrcode: (childId: string) =>
    apiClient.get<QRCodeResponse>(`/api/v1/attendance/qrcode/child/${childId}`),

  getStaffQrcode: (staffId: string) =>
    apiClient.get<QRCodeResponse>(`/api/v1/attendance/qrcode/staff/${staffId}`),

  scan: (data: {
    qr_payload: string
    event_type: EventType
    companion_name?: string
    companion_phone?: string
  }) => apiClient.post<AttendanceEvent>('/api/v1/attendance/scan', data),

  verifyScan: (qr_payload: string) =>
    apiClient.post<VerifyQrResponse>('/api/v1/attendance/scan/verify', { qr_payload }),

  listEvents: (params?: {
    person_type?: PersonType
    child_id?: string
    staff_id?: string
    date_from?: string
    date_to?: string
    skip?: number
    limit?: number
  }) => apiClient.get<AttendanceEventListResponse>('/api/v1/attendance/events', { params }),

  getChildrenDaily: (params: { date: string; department_id?: string; section_id?: string }) =>
    apiClient.get<ChildDailyStatusListResponse>('/api/v1/attendance/daily/children', { params }),

  // ── Portail staff : « Présence » de Mon Groupe (hors RBAC) ──
  getMyGroupDaily: (params: { date: string }) =>
    apiClient.get<ChildDailyStatusListResponse>('/api/v1/attendance/daily/my-group', { params }),

  getStaffDaily: (params: { date: string }) =>
    apiClient.get<StaffDailyStatusListResponse>('/api/v1/attendance/daily/staff', { params }),

  sendAbsenceInquiries: (params: { date: string; department_id?: string; section_id?: string; child_id?: string }) =>
    apiClient.post<AbsenceInquiryResponse>('/api/v1/attendance/absent-notifications', null, { params }),

  getDepartmentSettings: (departmentId: string) =>
    apiClient.get<DepartmentAttendanceSettings>(`/api/v1/attendance/settings/departments/${departmentId}`, {
      validateStatus: (s) => s === 200 || s === 404,
    }),

  setDepartmentSettings: (departmentId: string, data: AttendanceSettingsPayload) =>
    apiClient.put<DepartmentAttendanceSettings>(`/api/v1/attendance/settings/departments/${departmentId}`, data),

  getGeneralSettings: () =>
    apiClient.get<AttendanceGeneralSettings>('/api/v1/attendance/settings/general', {
      validateStatus: (s) => s === 200 || s === 404,
    }),

  setGeneralSettings: (data: AttendanceGeneralSettingsPayload) =>
    apiClient.put<AttendanceGeneralSettings>('/api/v1/attendance/settings/general', data),

  // ── Exemptions (personnel, enfant, section) ──
  listExemptions: (params?: { scope?: ExemptionScope; include_revoked?: boolean; limit?: number }) =>
    apiClient.get<ExemptionListResponse>('/api/v1/attendance/settings/exemptions', {
      params: { limit: 200, ...params },
    }),

  createExemption: (data: ExemptionCreatePayload) =>
    apiClient.post<Exemption>('/api/v1/attendance/settings/exemptions', data),

  updateExemption: (id: string, data: ExemptionUpdatePayload) =>
    apiClient.patch<Exemption>(`/api/v1/attendance/settings/exemptions/${id}`, data),

  revokeExemption: (id: string) =>
    apiClient.delete<void>(`/api/v1/attendance/settings/exemptions/${id}`),

  // ── Horaires personnalisés (staff) ──
  getStaffSchedule: (staffId: string) =>
    apiClient.get<StaffSchedule>(`/api/v1/attendance/settings/staff/${staffId}`, {
      validateStatus: (s) => s === 200 || s === 404,
    }),

  setStaffSchedule: (staffId: string, data: AttendanceSettingsPayload) =>
    apiClient.put<StaffSchedule>(`/api/v1/attendance/settings/staff/${staffId}`, data),

  deleteStaffSchedule: (staffId: string) =>
    apiClient.delete(`/api/v1/attendance/settings/staff/${staffId}`),

  // ── Export des présences (PDF / Excel) ──
  exportAttendance: (params: AttendanceExportParams) =>
    apiClient.get<Blob>('/api/v1/attendance/export', { ...BLOB_REQUEST, params }),

  // ── Correction manuelle (admin ou attendance:write) ──
  createManualEvent: (data: ManualEventPayload) =>
    apiClient.post<AttendanceEvent>('/api/v1/attendance/events/manual', data),

  updateEvent: (eventId: string, data: UpdateEventPayload) =>
    apiClient.patch<AttendanceEvent>(`/api/v1/attendance/events/${eventId}`, data),
}
