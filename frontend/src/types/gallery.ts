import type { ReportType } from '@/types/reports'

export type GallerySource = 'report' | 'message' | 'announcement'

/** Libellés dans les catalogues : `enums.gallerySources` (filtres, pluriel)
 *  et `enums.gallerySourceBadges` (pastilles, singulier). */
export const GALLERY_SOURCES = ['report', 'message', 'announcement'] as const

export interface GalleryUserBrief {
  id: string
  first_name: string
  last_name: string
  nickname: string | null
}

export interface GalleryChildBrief {
  id: string
  matricule: string
  last_name: string
  first_names: string
}

export interface GalleryMediaItem {
  id: string
  source: GallerySource
  filename: string
  content_type: string
  size_bytes: number
  uploaded_by: GalleryUserBrief
  created_at: string
  url: string
  child: GalleryChildBrief | null
  report_type: ReportType | null
  conversation_parent: GalleryUserBrief | null
  announcement_id: string | null
  announcement_title: string | null
}

export interface GalleryMediaListResponse {
  total: number
  items: GalleryMediaItem[]
}

export interface GalleryMediaParams {
  source?: GallerySource
  child_id?: string
  group_id?: string
  staff_id?: string
  department_id?: string
  report_type?: ReportType
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}

export function isImage(contentType: string) {
  return contentType.startsWith('image/')
}

export function isVideo(contentType: string) {
  return contentType.startsWith('video/')
}
