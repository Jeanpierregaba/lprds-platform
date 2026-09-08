export interface UserBrief {
  id:         string
  first_name: string
  last_name:  string
  nickname?:  string | null
}

export interface Attachment {
  id:           string
  filename:     string
  content_type: string
  size_bytes:   number
  uploaded_by:  UserBrief
  created_at:   string
  url:          string
}

export interface Announcement {
  id:               string
  establishment_id: string
  title:            string
  body:             string
  is_active:        boolean
  created_by:       UserBrief
  created_at:       string
  updated_at:       string
  read_count:       number | null
  total_parents:    number | null
  is_read:          boolean | null
  attachments:      Attachment[]
}

export interface AnnouncementListResponse {
  total: number
  items: Announcement[]
}

export interface AnnouncementCreatePayload {
  title: string
  body:  string
}

export interface AnnouncementUpdatePayload {
  title?:     string
  body?:      string
  is_active?: boolean
}

export interface Message {
  id:              string
  conversation_id: string
  sender:          UserBrief
  sender_role:     string
  body:            string
  read_at:         string | null
  created_at:      string
  attachments:     Attachment[]
}

export interface MessageListResponse {
  total: number
  items: Message[]
}

export interface Conversation {
  id:               string
  establishment_id: string
  parent:           UserBrief
  last_message_at:  string | null
  unread_count:     number
  created_at:       string
}

export interface ConversationListResponse {
  total: number
  items: Conversation[]
}

export interface ConversationStartPayload {
  parent_id: string
  body?: string
}

// ── Événements WebSocket ───────────────────────────────────────
export type WSAnnouncementEvent = Announcement & { type: 'announcement' }

export interface WSAnnouncementReadEvent {
  type:            'announcement_read'
  announcement_id: string
  read_count:      number
}

export type WSMessageEvent = Message & { type: 'message' }

export interface WSReadReceiptEvent {
  type:            'read_receipt'
  conversation_id: string
  reader_role:     'admin' | 'parent'
  message_ids:     string[]
  read_at:         string
}

export type WSAttachmentEvent = Attachment & { type: 'attachment'; message_id: string }
export type WSAnnouncementAttachmentEvent = Attachment & { type: 'announcement_attachment'; announcement_id: string }

export type MessagingWSEvent =
  | WSAnnouncementEvent
  | WSAnnouncementReadEvent
  | WSMessageEvent
  | WSReadReceiptEvent
  | WSAttachmentEvent
  | WSAnnouncementAttachmentEvent
