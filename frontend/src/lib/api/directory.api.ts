import { apiClient } from './client'
import type {
  DirectoryChildrenResponse,
  DirectoryStaffResponse,
  DirectoryUnitsResponse,
} from '@/types/directory'

/**
 * Annuaire de l'établissement — la source des SÉLECTEURS (listes déroulantes,
 * filtres de périmètre, recherche d'une personne à désigner).
 *
 * ⚠️ Ne pas l'utiliser pour afficher une LISTE DE TRAVAIL : une liste d'enfants
 * ou de personnel que l'on consulte passe par son propre module, qui porte les
 * champs du métier et la permission qui va avec. L'annuaire ne sert qu'à
 * CHOISIR quelqu'un.
 */
export const directoryApi = {
  listChildren: (params?: {
    search?: string
    section_id?: string
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<DirectoryChildrenResponse>('/api/v1/directory/children', { params }),

  listStaff: (params?: {
    search?: string
    staff_type?: string
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<DirectoryStaffResponse>('/api/v1/directory/staff', { params }),

  listUnits: (params?: { include_inactive?: boolean }) =>
    apiClient.get<DirectoryUnitsResponse>('/api/v1/directory/units', { params }),
}
