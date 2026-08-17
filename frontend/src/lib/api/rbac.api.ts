import { apiClient } from './client'
import type { Permission, Role, RoleCreatePayload, RoleUpdatePayload, UserRolesResponse } from '@/types/rbac'

export const rbacApi = {
  getMyPermissions: () => apiClient.get<UserRolesResponse>('/api/v1/rbac/me'),

  listPermissions: () => apiClient.get<Permission[]>('/api/v1/rbac/permissions'),

  listRoles: (includeInactive = false) =>
    apiClient.get<Role[]>('/api/v1/rbac/roles', { params: { include_inactive: includeInactive } }),

  createRole: (data: RoleCreatePayload) => apiClient.post<Role>('/api/v1/rbac/roles', data),

  updateRole: (id: string, data: RoleUpdatePayload) =>
    apiClient.patch<Role>(`/api/v1/rbac/roles/${id}`, data),

  deactivateRole: (id: string) => apiClient.delete<void>(`/api/v1/rbac/roles/${id}`),

  getUserRoles: (userId: string) =>
    apiClient.get<UserRolesResponse>(`/api/v1/rbac/staff/${userId}/roles`),

  assignRole: (userId: string, roleId: string) =>
    apiClient.post<UserRolesResponse>(`/api/v1/rbac/staff/${userId}/roles/${roleId}`),

  revokeRole: (userId: string, roleId: string) =>
    apiClient.delete<UserRolesResponse>(`/api/v1/rbac/staff/${userId}/roles/${roleId}`),
}
