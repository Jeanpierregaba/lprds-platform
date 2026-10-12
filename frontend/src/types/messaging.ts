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
  /** Départements ciblés — [] = broadcast à tous les parents. */
  department_ids:   string[]
  created_by:       UserBrief
  created_at:       string
  updated_at:       string
  read_count:       number | null
  total_parents:    number | null
  is_read:          boolean | null
  attachments:      Attachment[]
  /** La diffusion exige une signature des parents (coché à la création). */
  requires_signature: boolean
  /** Vue admin : combien de parents de l'audience ont signé. */
  signature_count:  number | null
  /** Vue parent : SA signature, et quand il l'a donnée. */
  is_signed:        boolean | null
  signed_at:        string | null
}

/** Un destinataire et ce qu'il a fait de la diffusion : rien, lu, signé. */
export interface AnnouncementRecipient {
  parent:      UserBrief
  email:       string
  read_at:     string | null
  signed_at:   string | null
  /** Le nom tel que TAPÉ par le parent (peut différer de celui du compte). */
  signed_name: string | null
}

export interface AnnouncementRecipientListResponse {
  total:              number
  read_count:         number
  signature_count:    number
  requires_signature: boolean
  items:              AnnouncementRecipient[]
}

export interface AnnouncementListResponse {
  total: number
  items: Announcement[]
}

export interface AnnouncementCreatePayload {
  title: string
  body:  string
  /** [] = tous les parents. */
  department_ids: string[]
  requires_signature: boolean
}

export interface AnnouncementUpdatePayload {
  title?:     string
  body?:      string
  is_active?: boolean
  /** null/omise = périmètre inchangé ; [] = retour au broadcast. */
  department_ids?: string[] | null
  /** Repasser à false cesse de DEMANDER : les signatures restent acquises. */
  requires_signature?: boolean
}

export interface Message {
  id:              string
  conversation_id: string
  sender:          UserBrief
  sender_role:     string
  body:            string | null
  edited_at:       string | null
  is_deleted:      boolean
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

export interface WSAnnouncementSignedEvent {
  type:            'announcement_signed'
  announcement_id: string
  signature_count: number
}

export type WSMessageEvent = Message & { type: 'message' }

export interface WSReadReceiptEvent {
  type:            'read_receipt'
  conversation_id: string
  reader_role:     'admin' | 'parent'
  message_ids:     string[]
  read_at:         string
}

export type WSAttachmentEvent = Attachment & { type: 'attachment'; conversation_id: string; message_id: string }
export type WSAnnouncementAttachmentEvent = Attachment & { type: 'announcement_attachment'; announcement_id: string }

export type MessagingWSEvent =
  | WSAnnouncementEvent
  | WSAnnouncementReadEvent
  | WSAnnouncementSignedEvent
  | WSMessageEvent
  | (Message & { type: 'message_updated' })
  | { type: 'message_deleted'; conversation_id: string; message_id: string }
  | WSReadReceiptEvent
  | WSAttachmentEvent
  | WSAnnouncementAttachmentEvent
