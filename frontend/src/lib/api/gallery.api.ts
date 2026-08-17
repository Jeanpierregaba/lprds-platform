import { apiClient } from './client'
import type { GalleryMediaListResponse, GalleryMediaParams } from '@/types/gallery'

export const galleryApi = {
  list: (params?: GalleryMediaParams) =>
    apiClient.get<GalleryMediaListResponse>('/api/v1/gallery/media', { params }),

  download: (url: string) => apiClient.get<Blob>(url, { responseType: 'blob' }),

  // ── Portail parent ───────────────────────────────────────────
  listMine: (params?: { source?: GalleryMediaParams['source']; child_id?: string; skip?: number; limit?: number }) =>
    apiClient.get<GalleryMediaListResponse>('/api/v1/gallery/mine', { params }),

  // ── Portail staff : médias envoyés via ses rapports (hors RBAC) ──
  listMyUploads: (params?: { source?: GalleryMediaParams['source']; child_id?: string; skip?: number; limit?: number }) =>
    apiClient.get<GalleryMediaListResponse>('/api/v1/gallery/my-uploads', { params }),
}
