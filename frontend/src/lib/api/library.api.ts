import { apiClient } from './client'
import type {
  Book,
  BookCreatePayload,
  BookListResponse,
  BookUpdatePayload,
  Lending,
  LendingCreatePayload,
  LendingListResponse,
  LibrarySettings,
  LibrarySettingsUpdatePayload,
  ReminderResult,
} from '@/types/library'

export const libraryApi = {
  // ── Paramètres (admin uniquement) ────────────────────────────
  getSettings: () => apiClient.get<LibrarySettings>('/api/v1/library/settings'),

  updateSettings: (data: LibrarySettingsUpdatePayload) =>
    apiClient.put<LibrarySettings>('/api/v1/library/settings', data),

  // ── Catalogue ────────────────────────────────────────────────
  createBook: (data: BookCreatePayload) => apiClient.post<Book>('/api/v1/library/books', data),

  listBooks: (params?: {
    section_id?: string
    include_inactive?: boolean
    skip?: number
    limit?: number
  }) => apiClient.get<BookListResponse>('/api/v1/library/books', { params }),

  getBook: (id: string) => apiClient.get<Book>(`/api/v1/library/books/${id}`),

  updateBook: (id: string, data: BookUpdatePayload) =>
    apiClient.patch<Book>(`/api/v1/library/books/${id}`, data),

  deactivateBook: (id: string) => apiClient.delete<Book>(`/api/v1/library/books/${id}`),

  // ── Prêts & retours ──────────────────────────────────────────
  createLending: (data: LendingCreatePayload) =>
    apiClient.post<Lending>('/api/v1/library/lendings', data),

  listLendings: (params?: {
    book_id?: string
    child_id?: string
    status_filter?: string
    skip?: number
    limit?: number
  }) => apiClient.get<LendingListResponse>('/api/v1/library/lendings', { params }),

  returnLending: (id: string) =>
    apiClient.post<Lending>(`/api/v1/library/lendings/${id}/return`),

  // ── Rappels (admin uniquement) ───────────────────────────────
  runReminders: () => apiClient.post<ReminderResult>('/api/v1/library/reminders/run'),

  // ── Consultation parent ──────────────────────────────────────
  listMyBooks: (params?: { skip?: number; limit?: number }) =>
    apiClient.get<BookListResponse>('/api/v1/library/mine/books', { params }),

  listMyLendings: (params?: { skip?: number; limit?: number }) =>
    apiClient.get<LendingListResponse>('/api/v1/library/mine/lendings', { params }),

  // ── Consultation éducatrice (livres de sa section) ───────────
  listEducatorBooks: (params?: { skip?: number; limit?: number }) =>
    apiClient.get<BookListResponse>('/api/v1/library/educator/books', { params }),
}
