import { apiClient } from './client'
import type { Menu, MenuCreatePayload, MenuListResponse, MenuWritePayload } from '@/types/menus'

export const menusApi = {
  getCurrent: () =>
    apiClient.get<Menu>('/api/v1/menus/current', { validateStatus: (s) => s === 200 || s === 404 }),

  get: (weekStart: string) =>
    apiClient.get<Menu>(`/api/v1/menus/${weekStart}`, { validateStatus: (s) => s === 200 || s === 404 || s === 403 }),

  create: (data: MenuCreatePayload) => apiClient.post<Menu>('/api/v1/menus', data),

  update: (weekStart: string, data: MenuWritePayload) =>
    apiClient.patch<Menu>(`/api/v1/menus/${weekStart}`, data),

  remove: (weekStart: string) => apiClient.delete<void>(`/api/v1/menus/${weekStart}`),

  list: (params?: { skip?: number; limit?: number }) =>
    apiClient.get<MenuListResponse>('/api/v1/menus', { params }),
}
