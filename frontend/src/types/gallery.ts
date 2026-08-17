import type { ReportType } from '@/types/reports'

export type GallerySource = 'report' | 'message'

export const GALLERY_SOURCE_LABELS: Record<GallerySource, string> = {
  report: 'Rapports',
  message: 'Messagerie',
}

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
