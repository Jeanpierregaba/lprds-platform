export type ArticleStatus = 'draft' | 'published'

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
}

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

export interface Article extends ArticleListItem {
  establishment_id: string
  content: string
  created_by: BlogUserBrief
  updated_by: BlogUserBrief | null
  attachments: BlogAttachment[]
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
