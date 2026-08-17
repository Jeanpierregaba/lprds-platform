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

  setStatus: (id: string, isActive: boolean) =>
    apiClient.patch<Staff>(`/api/v1/staff/${id}/status`, { is_active: isActive }),
}
