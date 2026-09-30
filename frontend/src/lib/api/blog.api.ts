import { apiClient } from './client'
import type {
  Article, ArticleCreatePayload, ArticleListResponse, ArticleStatus,
  ArticleTranslationPayload, ArticleUpdatePayload,
  BlogAttachment, BlogTag, BlogTagListResponse, GalleryPhoto, GalleryPhotoCategory,
  GalleryPhotoCategoryListResponse, GalleryPhotoListResponse,
} from '@/types/blog'

export const blogApi = {
  listTags: () => apiClient.get<BlogTagListResponse>('/api/v1/blog/tags'),
  createTag: (name: string) => apiClient.post<BlogTag>('/api/v1/blog/tags', { name }),
  updateTag: (id: string, name: string) => apiClient.patch<BlogTag>(`/api/v1/blog/tags/${id}`, { name }),
  deleteTag: (id: string) => apiClient.delete<void>(`/api/v1/blog/tags/${id}`),

  list: (params?: {
    status?: ArticleStatus
    tag_id?: string
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<ArticleListResponse>('/api/v1/blog/articles', { params }),

  get: (id: string) => apiClient.get<Article>(`/api/v1/blog/articles/${id}`),

  create: (data: ArticleCreatePayload) => apiClient.post<Article>('/api/v1/blog/articles', data),

  update: (id: string, data: ArticleUpdatePayload) =>
    apiClient.patch<Article>(`/api/v1/blog/articles/${id}`, data),

  remove: (id: string) => apiClient.delete<void>(`/api/v1/blog/articles/${id}`),

  publish: (id: string) => apiClient.post<Article>(`/api/v1/blog/articles/${id}/publish`),

  /** Relance la traduction — seul chemin qui écrase une correction manuelle. */
  retranslate: (id: string) =>
    apiClient.post<Article>(`/api/v1/blog/articles/${id}/retranslate`),

  /** Corrige la version anglaise — bascule le statut en `manual`. */
  setTranslation: (id: string, data: ArticleTranslationPayload) =>
    apiClient.patch<Article>(`/api/v1/blog/articles/${id}/translation`, data),

  setCover: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<Article>(`/api/v1/blog/articles/${id}/cover`, form)
  },

  downloadCover: (id: string) =>
    apiClient.get<Blob>(`/api/v1/blog/articles/${id}/cover`, { responseType: 'blob' }),

  uploadAttachment: (articleId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<BlogAttachment>(`/api/v1/blog/articles/${articleId}/attachments`, form)
  },

  downloadAttachment: (articleId: string, attachmentId: string) =>
    apiClient.get<Blob>(`/api/v1/blog/articles/${articleId}/attachments/${attachmentId}`, { responseType: 'blob' }),

  deleteAttachment: (articleId: string, attachmentId: string) =>
    apiClient.delete<void>(`/api/v1/blog/articles/${articleId}/attachments/${attachmentId}`),

  listGalleryCategories: () =>
    apiClient.get<GalleryPhotoCategoryListResponse>('/api/v1/blog/gallery/categories'),

  createGalleryCategory: (name: string) =>
    apiClient.post<GalleryPhotoCategory>('/api/v1/blog/gallery/categories', { name }),

  updateGalleryCategory: (id: string, name: string) =>
    apiClient.patch<GalleryPhotoCategory>(`/api/v1/blog/gallery/categories/${id}`, { name }),

  deleteGalleryCategory: (id: string) =>
    apiClient.delete<void>(`/api/v1/blog/gallery/categories/${id}`),

  listGallery: (params?: { category_id?: string; skip?: number; limit?: number }) =>
    apiClient.get<GalleryPhotoListResponse>('/api/v1/blog/gallery', { params }),

  uploadGallery: (categoryId: string, file: File) => {
    const form = new FormData()
    form.append('category_id', categoryId)
    form.append('file', file)
    return apiClient.post<GalleryPhoto>('/api/v1/blog/gallery', form)
  },

  downloadGalleryImage: (id: string) =>
    apiClient.get<Blob>(`/api/v1/blog/gallery/${id}/image`, { responseType: 'blob' }),

  deleteGallery: (id: string) => apiClient.delete<void>(`/api/v1/blog/gallery/${id}`),
}
