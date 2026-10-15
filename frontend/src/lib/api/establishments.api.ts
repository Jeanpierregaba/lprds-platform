import { apiClient } from './client'
import type {
  Establishment, EstablishmentDetail, EstablishmentListResponse,
  EstablishmentCreatePayload, EstablishmentUpdatePayload,
  EstablishmentAdminCreatePayload, EstablishmentAdminUpdatePayload,
  EstablishmentListParams,
} from '@/types/establishment'
import type { User } from '@/types/auth'

export const establishmentsApi = {
  list: (params?: EstablishmentListParams) =>
    apiClient.get<EstablishmentListResponse>('/api/v1/establishments', { params }),

  get: (id: string) =>
    apiClient.get<EstablishmentDetail>(`/api/v1/establishments/${id}`),

  create: (data: EstablishmentCreatePayload) =>
    apiClient.post<EstablishmentDetail>('/api/v1/establishments', data),

  update: (id: string, data: EstablishmentUpdatePayload) =>
    apiClient.patch<Establishment>(`/api/v1/establishments/${id}`, data),

  remove: (id: string) =>
    apiClient.delete<void>(`/api/v1/establishments/${id}`),

  listAdmins: (id: string) =>
    apiClient.get<User[]>(`/api/v1/establishments/${id}/admins`),

  addAdmin: (id: string, data: EstablishmentAdminCreatePayload) =>
    apiClient.post<User>(`/api/v1/establishments/${id}/admins`, data),

  /** Le surnom d'un admin EXISTANT. Les comptes créés avant l'ajout du champ
   *  n'ont aucun autre moyen d'en recevoir un : leur fiche ne se saisit qu'à
   *  la création, et un compte admin ne se recrée pas. */
  updateAdmin: (id: string, userId: string, data: EstablishmentAdminUpdatePayload) =>
    apiClient.patch<User>(`/api/v1/establishments/${id}/admins/${userId}`, data),

  removeAdmin: (id: string, userId: string) =>
    apiClient.delete<void>(`/api/v1/establishments/${id}/admins/${userId}`),
}
