import { apiClient } from './client'
import type {
  Department, DepartmentCreatePayload, DepartmentUpdatePayload,
  Section, SectionCreatePayload, SectionUpdatePayload,
  Group, GroupCreatePayload, GroupUpdatePayload,
} from '@/types/organization'

export const organizationApi = {
  listDepartments: (includeInactive = false) =>
    apiClient.get<Department[]>('/api/v1/departments', { params: { include_inactive: includeInactive } }),

  createDepartment: (data: DepartmentCreatePayload) =>
    apiClient.post<Department>('/api/v1/departments', data),

  updateDepartment: (id: string, data: DepartmentUpdatePayload) =>
    apiClient.patch<Department>(`/api/v1/departments/${id}`, data),

  deactivateDepartment: (id: string) => apiClient.delete<void>(`/api/v1/departments/${id}`),

  listSections: (params?: { department_id?: string; include_inactive?: boolean }) =>
    apiClient.get<Section[]>('/api/v1/sections', { params }),

  createSection: (data: SectionCreatePayload) => apiClient.post<Section>('/api/v1/sections', data),

  updateSection: (id: string, data: SectionUpdatePayload) =>
    apiClient.patch<Section>(`/api/v1/sections/${id}`, data),

  deactivateSection: (id: string) => apiClient.delete<void>(`/api/v1/sections/${id}`),

  listGroups: (params?: { section_id?: string; include_inactive?: boolean }) =>
    apiClient.get<Group[]>('/api/v1/groups', { params }),

  getGroup: (id: string) => apiClient.get<Group>(`/api/v1/groups/${id}`),

  createGroup: (data: GroupCreatePayload) => apiClient.post<Group>('/api/v1/groups', data),

  updateGroup: (id: string, data: GroupUpdatePayload) =>
    apiClient.patch<Group>(`/api/v1/groups/${id}`, data),

  deactivateGroup: (id: string) => apiClient.delete<void>(`/api/v1/groups/${id}`),

  assignChild: (groupId: string, childId: string) =>
    apiClient.post<Group>(`/api/v1/groups/${groupId}/children/${childId}`),

  removeChild: (groupId: string, childId: string) =>
    apiClient.delete<Group>(`/api/v1/groups/${groupId}/children/${childId}`),
}
