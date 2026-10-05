'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useMessagingEvent } from './socket-context'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Attachment, Message, MessageListResponse } from '@/types/messaging'

export const THREAD_PAGE_SIZE = 50
export const EDIT_WINDOW_MS = 15 * 60 * 1000
export const MAX_MESSAGE_MEDIA = 15

export function isEditable(msg: Message): boolean {
  return !msg.is_deleted && Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS
}

export interface ThreadApi {
  list: (params: { before_id?: string; limit?: number }) => Promise<MessageListResponse>
  send: (body: string) => Promise<Message>
  uploadBatch: (messageId: string, files: File[]) => Promise<Attachment[]>
  edit: (messageId: string, body: string) => Promise<Message>
  remove: (messageId: string) => Promise<void>
  removeAttachment: (messageId: string, attachmentId: string) => Promise<void>
}

function scrollToBottom(el: HTMLDivElement | null) {
  el?.scrollTo({ top: el.scrollHeight })
}

export function useConversationThread({
  messagesKey,
  conversationId,
  ownRole,
  api,
  onThreadChanged,
  onIncomingFromOther,
}: {
  messagesKey: readonly unknown[]
  conversationId: string | undefined
  ownRole: 'admin' | 'parent'
  api: ThreadApi
  onThreadChanged: () => void
  onIncomingFromOther: () => void
}) {
  const t = useTranslations('messaging')
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<File[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editingAttachmentCount, setEditingAttachmentCount] = useState(0)
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const lastSeenIdRef = useRef<string | null>(null)
  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId

  useEffect(() => {
    atBottomRef.current = true
    setIsAtBottom(true)
    lastSeenIdRef.current = null
    setNewCount(0)
    setEditingId(null)
    setEditingAttachmentCount(0)
    setPicked([])
    setPickerOpen(false)
  }, [conversationId])

  const { data: messagesData, isLoading, isError, refetch: refetchMessages } = useQuery({
    queryKey: conversationId ? messagesKey : [...messagesKey, 'none'],
    queryFn: () => api.list({ limit: THREAD_PAGE_SIZE }),
    enabled: !!conversationId,
  })

  const messages = messagesData?.items ?? []
  const total = messagesData?.total ?? 0
  const hasMore = messages.length < total

  useEffect(() => {
    if (messages.length === 0) {
      lastSeenIdRef.current = null
      return
    }
    const last = messages[messages.length - 1]
    if (!last) {
      lastSeenIdRef.current = null
      return
    }
    // L'écho de ses propres messages (autre onglet/appareil) ne compte pas
    // comme « nouveau » et ne déclenche pas la pastille.
    if (last.sender_role === ownRole) {
      lastSeenIdRef.current = last.id
      if (atBottomRef.current) scrollToBottom(scrollRef.current)
      return
    }
    const prevId = lastSeenIdRef.current
    lastSeenIdRef.current = last.id
    if (prevId === last.id) return
    // Compte les vrais nouveaux (batch), pas +1 par rendu.
    const prevIndex = prevId ? messages.findIndex((m) => m.id === prevId) : -1
    const added = prevIndex >= 0 ? messages.length - 1 - prevIndex : 1
    if (atBottomRef.current) {
      scrollToBottom(scrollRef.current)
      setNewCount(0)
    } else {
      setNewCount((c) => c + Math.max(added, 1))
    }
  }, [messages, ownRole])

  const loadOlder = useCallback(async () => {
    // Clé et conversation capturées à l'appel : si l'utilisateur a changé de
    // conversation pendant le vol, on ignore le résultat (pas de
    // contamination croisée) et on ne touche pas au spinner courant.
    const key = messagesKey
    const convId = conversationId
    const cached = queryClient.getQueryData<MessageListResponse>(key)
    const items = cached?.items ?? []
    const first = items[0]
    if (loadingOlder || !convId || !first || items.length >= (cached?.total ?? 0)) return
    setLoadingOlder(true)
    const prevHeight = scrollRef.current?.scrollHeight ?? 0
    try {
      const older = await api.list({ before_id: first.id, limit: THREAD_PAGE_SIZE })
      if (convId !== conversationIdRef.current) return
      queryClient.setQueryData<MessageListResponse | undefined>(key, (old) => {
        if (!old) return old
        const known = new Set(old.items.map((m) => m.id))
        const fresh = older.items.filter((m) => !known.has(m.id))
        return { total: older.total, items: [...fresh, ...old.items] }
      })
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop += el.scrollHeight - prevHeight
      })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      if (convId === conversationIdRef.current) setLoadingOlder(false)
    }
  }, [api, conversationId, loadingOlder, messagesKey, queryClient])

  const loadOlderRef = useRef(loadOlder)
  loadOlderRef.current = loadOlder

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    atBottomRef.current = nearBottom
    setIsAtBottom(nearBottom)
    if (nearBottom) setNewCount(0)
    if (el.scrollTop < 80) loadOlderRef.current()
  }, [])

  const jumpToBottom = useCallback(() => {
    scrollToBottom(scrollRef.current)
    atBottomRef.current = true
    setNewCount(0)
  }, [])

  const appendMessage = useCallback(
    (message: Message) =>
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old
          ? old.items.some((m) => m.id === message.id)
            ? old
            : { total: old.total + 1, items: [...old.items, message] }
          : old
      ),
    [messagesKey, queryClient]
  )

  const replaceMessage = useCallback(
    (message: Message) =>
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old ? { ...old, items: old.items.map((m) => (m.id === message.id ? message : m)) } : old
      ),
    [messagesKey, queryClient]
  )

  /** Fusionne des pièces jointes dans un message du cache. Retourne false si
   * le message n'y est pas (l'appelant recharge alors). */
  const mergeAttachments = useCallback(
    (messageId: string, attachments: Attachment[]): boolean => {
      let found = false
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) => {
        if (!old) return old
        const items = old.items.map((m) => {
          if (m.id !== messageId) return m
          found = true
          const known = new Set(m.attachments.map((a) => a.id))
          return {
            ...m,
            attachments: [...m.attachments, ...attachments.filter((a) => !known.has(a.id))],
          }
        })
        return { ...old, items }
      })
      return found
    },
    [messagesKey, queryClient]
  )

  useMessagingEvent((event) => {
    if (!conversationId) return
    if (event.type === 'message' && event.conversation_id === conversationId) {
      appendMessage(event)
      onThreadChanged()
      if (event.sender_role !== ownRole) onIncomingFromOther()
    } else if (event.type === 'message_updated' && event.conversation_id === conversationId) {
      replaceMessage(event)
    } else if (event.type === 'message_deleted' && event.conversation_id === conversationId) {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((m) =>
                m.id === event.message_id ? { ...m, body: null, is_deleted: true, attachments: [] } : m
              ),
            }
          : old
      )
      onThreadChanged()
    } else if (event.type === 'read_receipt' && event.conversation_id === conversationId) {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((m) =>
                event.message_ids.includes(m.id) ? { ...m, read_at: event.read_at } : m
              ),
            }
          : old
      )
      onThreadChanged()
    } else if (event.type === 'attachment' && event.conversation_id === conversationId) {
      // Fusion directe plutôt qu'invalidate (qui ne rechargerait que la
      // dernière page et jetterait l'historique remonté). Repli : si le
      // message n'est pas dans le cache (vieille page), on recharge.
      const merged = mergeAttachments(event.message_id, [
        {
          id: event.id,
          filename: event.filename,
          content_type: event.content_type,
          size_bytes: event.size_bytes,
          uploaded_by: event.uploaded_by,
          created_at: event.created_at,
          url: event.url,
        },
      ])
      if (!merged) queryClient.invalidateQueries({ queryKey: messagesKey })
    }
  })

  const sendMutation = useMutation({
    mutationFn: (text: string) => api.send(text),
    onSuccess: (message) => {
      appendMessage(message)
      onThreadChanged()
      setBody('')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const sendMediaMutation = useMutation({
    mutationFn: async ({ text, files }: { text: string; files: File[] }) => {
      const message = await api.send(text)
      try {
        const attachments = await api.uploadBatch(message.id, files)
        return { message, attachments, uploaded: true }
      } catch {
        // Texte créé côté serveur mais médias en échec : on affiche quand
        // même le message (pas de fantôme invisible) avec un avertissement —
        // un retry renvoyerait le texte en double.
        return { message, attachments: [] as Attachment[], uploaded: false }
      }
    },
    onSuccess: ({ message, attachments, uploaded }) => {
      appendMessage(message)
      if (attachments.length > 0) mergeAttachments(message.id, attachments)
      onThreadChanged()
      setBody('')
      setPicked([])
      setPickerOpen(false)
      if (!uploaded) {
        toast.warning(t('thread.mediaFailed'))
      }
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.edit(id, text),
    onSuccess: (message) => {
      replaceMessage(message)
      setEditingId(null)
      setEditingAttachmentCount(0)
    },
    onError: (err) => {
      // Fenêtre de 15 min calculée côté serveur : l'horloge client peut
      // afficher le bouton à tort (dérive) — message explicite, pas générique.
      const detail = getApiErrorMessage(err)
      toast.error(
        detail.includes('15 minutes') ? t('thread.editWindowOver') : detail
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((m) =>
                m.id === id ? { ...m, body: null, is_deleted: true, attachments: [] } : m
              ),
            }
          : old
      )
      onThreadChanged()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const removeAttachmentMutation = useMutation({
    mutationFn: ({ messageId, attachmentId }: { messageId: string; attachmentId: string }) =>
      api.removeAttachment(messageId, attachmentId),
    onSuccess: (_data, { messageId, attachmentId }) => {
      setRemovingAttachmentId(null)
      // Retrait optimiste : l'événement serveur `message_updated` confirmera
      // (aucun invalidate — il jetterait l'historique remonté).
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((m) =>
                m.id === messageId
                  ? { ...m, attachments: m.attachments.filter((a) => a.id !== attachmentId) }
                  : m
              ),
            }
          : old
      )
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err))
      setRemovingAttachmentId(null)
    },
  })

  const busy = sendMutation.isPending || sendMediaMutation.isPending
  const canSend = !busy && (!!body.trim() || picked.length > 0)

  const onSend = () => {
    if (!canSend) return
    const trimmed = body.trim()
    if (picked.length > 0) sendMediaMutation.mutate({ text: trimmed, files: picked })
    else sendMutation.mutate(trimmed)
  }

  return {
    messages,
    isLoading,
    isError,
    refetchMessages,
    isLoadingOlder: loadingOlder,
    hasMore,
    isAtBottom,
    scrollRef,
    handleScroll,
    newCount,
    jumpToBottom,
    body,
    setBody,
    picked,
    setPicked,
    pickerOpen,
    setPickerOpen,
    busy,
    canSend,
    onSend,
    editingId,
    draft,
    setDraft,
    startEdit: (msg: Message) => {
      setEditingId(msg.id)
      setDraft(msg.body ?? '')
      setEditingAttachmentCount(msg.attachments.length)
    },
    cancelEdit: () => {
      setEditingId(null)
      setEditingAttachmentCount(0)
    },
    saveEdit: () => {
      // Comme le serveur : texte vide accepté s'il reste ≥ 1 pièce jointe.
      if (editingId && (draft.trim() || editingAttachmentCount > 0)) {
        editMutation.mutate({ id: editingId, text: draft.trim() })
      }
    },
    editPending: editMutation.isPending,
    deleteMessage: (id: string) => deleteMutation.mutate(id),
    deletePending: deleteMutation.isPending,
    deletingIds: deleteMutation.variables ? [deleteMutation.variables] : [],
    removeAttachment: (messageId: string, attachmentId: string) => {
      setRemovingAttachmentId(attachmentId)
      removeAttachmentMutation.mutate({ messageId, attachmentId })
    },
    removingAttachmentId,
  }
}
