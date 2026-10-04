import { BLOB_REQUEST } from '@/lib/api/blob-request'
import { apiClient } from './client'
import type {
  Announcement, AnnouncementCreatePayload, AnnouncementListResponse, AnnouncementUpdatePayload,
  Attachment, Conversation, ConversationListResponse, ConversationStartPayload, Message, MessageListResponse,
} from '@/types/messaging'

export const messagingApi = {
  // ── Diffusions ──────────────────────────────────────────────
  listAnnouncements: (params?: { include_inactive?: boolean; skip?: number; limit?: number }) =>
    apiClient.get<AnnouncementListResponse>('/api/v1/messaging/announcements', { params }),

  createAnnouncement: (data: AnnouncementCreatePayload) =>
    apiClient.post<Announcement>('/api/v1/messaging/announcements', data),

  updateAnnouncement: (id: string, data: AnnouncementUpdatePayload) =>
    apiClient.patch<Announcement>(`/api/v1/messaging/announcements/${id}`, data),

  uploadAnnouncementAttachment: (announcementId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<Attachment>(`/api/v1/messaging/announcements/${announcementId}/attachments`, form)
  },

  uploadAnnouncementAttachments: (announcementId: string, files: File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return apiClient.post<Attachment[]>(`/api/v1/messaging/announcements/${announcementId}/attachments/batch`, form)
  },

  // ── Conversations (admin) ───────────────────────────────────
  listConversations: (params?: { skip?: number; limit?: number; before_id?: string }) =>
    apiClient.get<ConversationListResponse>('/api/v1/messaging/conversations', { params }),

  startConversation: (data: ConversationStartPayload) =>
    apiClient.post<Conversation>('/api/v1/messaging/conversations', data),

  listConversationMessages: (conversationId: string, params?: { skip?: number; limit?: number; before_id?: string }) =>
    apiClient.get<MessageListResponse>(`/api/v1/messaging/conversations/${conversationId}/messages`, { params }),

  sendConversationMessage: (conversationId: string, body: string) =>
    apiClient.post<Message>(`/api/v1/messaging/conversations/${conversationId}/messages`, { body }),

  markConversationRead: (conversationId: string) =>
    apiClient.post<void>(`/api/v1/messaging/conversations/${conversationId}/read`),

  uploadConversationAttachment: (conversationId: string, messageId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<Attachment>(
      `/api/v1/messaging/conversations/${conversationId}/messages/${messageId}/attachments`,
      form
    )
  },

  editMessage: (conversationId: string, messageId: string, body: string) =>
    apiClient.patch<Message>(`/api/v1/messaging/conversations/${conversationId}/messages/${messageId}`, { body }),

  deleteMessage: (conversationId: string, messageId: string) =>
    apiClient.delete<void>(`/api/v1/messaging/conversations/${conversationId}/messages/${messageId}`),

  removeMessageAttachment: (conversationId: string, messageId: string, attachmentId: string) =>
    apiClient.delete<void>(`/api/v1/messaging/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`),

  uploadMessageAttachments: (conversationId: string, messageId: string, files: File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return apiClient.post<Attachment[]>(`/api/v1/messaging/conversations/${conversationId}/messages/${messageId}/attachments/batch`, form)
  },

  // ── Pièces jointes ──────────────────────────────────────────
  downloadAttachment: (id: string) =>
    apiClient.get<Blob>(`/api/v1/messaging/attachments/${id}`, BLOB_REQUEST),

  // ── Portail parent ───────────────────────────────────────────
  markAnnouncementRead: (id: string) => apiClient.post<void>(`/api/v1/messaging/announcements/${id}/read`),

  getMyConversation: () => apiClient.get<Conversation>('/api/v1/messaging/conversations/me'),

  listMyMessages: (params?: { skip?: number; limit?: number; before_id?: string }) =>
    apiClient.get<MessageListResponse>('/api/v1/messaging/conversations/me/messages', { params }),

  sendMyMessage: (body: string) =>
    apiClient.post<Message>('/api/v1/messaging/conversations/me/messages', { body }),

  markMyConversationRead: () => apiClient.post<void>('/api/v1/messaging/conversations/me/read'),

  uploadMyMessageAttachment: (messageId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<Attachment>(`/api/v1/messaging/conversations/me/messages/${messageId}/attachments`, form)
  },

  uploadMyMessageAttachments: (messageId: string, files: File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return apiClient.post<Attachment[]>(`/api/v1/messaging/conversations/me/messages/${messageId}/attachments/batch`, form)
  },

  editMyMessage: (messageId: string, body: string) =>
    apiClient.patch<Message>(`/api/v1/messaging/conversations/me/messages/${messageId}`, { body }),

  deleteMyMessage: (messageId: string) =>
    apiClient.delete<void>(`/api/v1/messaging/conversations/me/messages/${messageId}`),

  removeMyMessageAttachment: (messageId: string, attachmentId: string) =>
    apiClient.delete<void>(`/api/v1/messaging/conversations/me/messages/${messageId}/attachments/${attachmentId}`),
}
