import { apiClient } from './client'
import type {
  CurrentMenusResponse, Menu, MenuCreatePayload, MenuListResponse, MenuTranslation,
  MenuTranslationPayload, MenuWritePayload, VisibleDepartmentsResponse,
} from '@/types/menus'

export const menusApi = {
  /** Semaine en cours : UN menu par département visible. */
  getCurrent: () =>
    apiClient.get<CurrentMenusResponse>('/api/v1/menus/current'),

  /** Départements dont l'appelant voit les menus (sélecteurs UI). */
  getVisibleDepartments: () =>
    apiClient.get<VisibleDepartmentsResponse>('/api/v1/menus/departments'),

  get: (weekStart: string, departmentId: string) =>
    apiClient.get<Menu>(`/api/v1/menus/${weekStart}`, {
      params: { department_id: departmentId },
      validateStatus: (s) => s === 200 || s === 404 || s === 403,
    }),

  create: (data: MenuCreatePayload) => apiClient.post<Menu>('/api/v1/menus', data),

  update: (weekStart: string, departmentId: string, data: MenuWritePayload) =>
    apiClient.patch<Menu>(`/api/v1/menus/${weekStart}`, data, {
      params: { department_id: departmentId },
    }),

  remove: (weekStart: string, departmentId: string) =>
    apiClient.delete<void>(`/api/v1/menus/${weekStart}`, {
      params: { department_id: departmentId },
    }),

  /** Français et anglais côte à côte — `menus:write` requis. */
  getTranslation: (weekStart: string, departmentId: string) =>
    apiClient.get<MenuTranslation>(`/api/v1/menus/${weekStart}/translation`, {
      params: { department_id: departmentId },
    }),

  /**
   * Enregistre l'anglais relu. Le backend le grave aussi dans la mémoire de
   * traduction : la correction vaut pour les semaines suivantes, pas seulement
   * pour celle-ci.
   */
  setTranslation: (weekStart: string, departmentId: string, data: MenuTranslationPayload) =>
    apiClient.patch<MenuTranslation>(`/api/v1/menus/${weekStart}/translation`, data, {
      params: { department_id: departmentId },
    }),

  list: (params?: { department_id?: string; skip?: number; limit?: number }) =>
    apiClient.get<MenuListResponse>('/api/v1/menus', { params }),
}
