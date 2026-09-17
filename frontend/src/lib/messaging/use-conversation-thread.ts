'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useMessagingEvent } from './socket-context'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Message, MessageListResponse } from '@/types/messaging'

export const THREAD_PAGE_SIZE = 50
export const EDIT_WINDOW_MS = 15 * 60 * 1000
export const MAX_MESSAGE_MEDIA = 15

export function isEditable(msg: Message): boolean {
  return !msg.is_deleted && Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS
}

export interface ThreadApi {
  list: (params: { before_id?: string; limit?: number }) => Promise<MessageListResponse>
  send: (body: string) => Promise<Message>
  uploadBatch: (messageId: string, files: File[]) => Promise<unknown>
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
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<File[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const lastSeenIdRef = useRef<string | null>(null)

  useEffect(() => {
    atBottomRef.current = true
    lastSeenIdRef.current = null
    setNewCount(0)
    setEditingId(null)
    setPicked([])
    setPickerOpen(false)
  }, [conversationId])

  const { data: messagesData, isLoading } = useQuery({
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
    const lastId = last.id
    if (lastSeenIdRef.current === lastId) return
    lastSeenIdRef.current = lastId
    if (atBottomRef.current) {
      scrollToBottom(scrollRef.current)
      setNewCount(0)
    } else {
      setNewCount((c) => c + 1)
    }
  }, [messages])

  const loadOlder = useCallback(async () => {
    const cached = queryClient.getQueryData<MessageListResponse>(messagesKey)
    const items = cached?.items ?? []
    const first = items[0]
    if (loadingOlder || !conversationId || !first || items.length >= (cached?.total ?? 0)) return
    setLoadingOlder(true)
    const prevHeight = scrollRef.current?.scrollHeight ?? 0
    try {
      const older = await api.list({ before_id: first.id, limit: THREAD_PAGE_SIZE })
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old ? { total: old.total, items: [...older.items, ...old.items] } : old
      )
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop += el.scrollHeight - prevHeight
      })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setLoadingOlder(false)
    }
  }, [api, conversationId, loadingOlder, messagesKey, queryClient])

  const loadOlderRef = useRef(loadOlder)
  loadOlderRef.current = loadOlder

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    atBottomRef.current = nearBottom
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
    } else if (event.type === 'attachment' && event.message_id) {
      queryClient.invalidateQueries({ queryKey: messagesKey })
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
      await api.uploadBatch(message.id, files)
      return message
    },
    onSuccess: (message) => {
      appendMessage(message)
      onThreadChanged()
      setBody('')
      setPicked([])
      setPickerOpen(false)
      queryClient.invalidateQueries({ queryKey: messagesKey })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.edit(id, text),
    onSuccess: (message) => {
      replaceMessage(message)
      setEditingId(null)
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
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
    onSuccess: () => {
      setRemovingAttachmentId(null)
      queryClient.invalidateQueries({ queryKey: messagesKey })
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
    isLoadingOlder: loadingOlder,
    hasMore,
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
    },
    cancelEdit: () => setEditingId(null),
    saveEdit: () => {
      if (editingId && draft.trim()) editMutation.mutate({ id: editingId, text: draft.trim() })
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
