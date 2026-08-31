import { apiClient } from './client'
import type {
  AttendanceEvent, AttendanceEventListResponse, AttendanceGeneralSettings, AttendanceGeneralSettingsPayload,
  AttendanceSettingsPayload, ChildDailyStatusListResponse, DepartmentAttendanceSettings, EventType,
  PersonType, QRCodeResponse, StaffDailyStatusListResponse, StaffExemption, StaffSchedule,
  AttendanceExportParams,
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

  listExemptions: (exemptOnly = false) =>
    apiClient.get<StaffExemption[]>('/api/v1/attendance/settings/exempt-staff', {
      params: { exempt_only: exemptOnly },
    }),

  setExemption: (staffId: string, exempt: boolean) =>
    apiClient.patch<StaffExemption>(`/api/v1/attendance/settings/exempt-staff/${staffId}`, { exempt }),

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
    apiClient.get<Blob>('/api/v1/attendance/export', { params, responseType: 'blob' }),
}
