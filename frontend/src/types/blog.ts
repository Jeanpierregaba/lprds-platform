export type ArticleStatus = 'draft' | 'published'

/** Libellés dans les catalogues (`enums.articleStatus`). */
export const ARTICLE_STATUSES = ['draft', 'published'] as const

export interface BlogUserBrief {
  id: string
  first_name: string
  last_name: string
  nickname: string | null
}

export interface TagBrief {
  id: string
  name: string
}

export interface GalleryPhotoCategory {
  id: string
  name: string
  created_at: string
}

export interface GalleryPhotoCategoryListResponse {
  items: GalleryPhotoCategory[]
}

export interface BlogTag {
  id: string
  name: string
  created_at: string
}

export interface BlogTagListResponse {
  items: BlogTag[]
}

export interface BlogAttachment {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  uploaded_by: BlogUserBrief
  created_at: string
  url: string
}

export interface GalleryPhoto {
  id: string
  category: GalleryPhotoCategory | null
  filename: string
  content_type: string
  size_bytes: number
  uploaded_by: BlogUserBrief
  created_at: string
  url: string
}

export interface GalleryPhotoListResponse {
  total: number
  items: GalleryPhoto[]
}

export interface ArticleListItem {
  id: string
  title: string
  status: ArticleStatus
  tag: TagBrief | null
  cover_url: string | null
  is_active: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

/**
 * État de la version anglaise d'un article — codes stables du backend.
 * `manual` est celui qui porte la règle : une traduction corrigée à la main
 * n'est jamais réécrite par la machine.
 */
export const TRANSLATION_STATUSES = ['pending', 'auto', 'manual', 'failed'] as const
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number]

export interface Article extends ArticleListItem {
  establishment_id: string
  content: string
  created_by: BlogUserBrief
  updated_by: BlogUserBrief | null
  attachments: BlogAttachment[]
  title_en: string | null
  content_en: string | null
  source_locale: string
  translation_status: TranslationStatus
}

export interface ArticleTranslationPayload {
  title_en: string
  content_en: string
}

export interface ArticleListResponse {
  total: number
  items: ArticleListItem[]
}

export interface ArticleCreatePayload {
  title: string
  content: string
  tag_id?: string | null
}

export interface ArticleUpdatePayload {
  title?: string
  content?: string
  tag_id?: string | null
}

export function isImage(contentType: string) {
  return contentType.startsWith('image/')
}

export function isVideo(contentType: string) {
  return contentType.startsWith('video/')
}
