'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Loader2, MessagesSquare, Paperclip, Plus, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { messagingApi } from '@/lib/api/messaging.api'
import { parentsApi } from '@/lib/api/parents.api'
import { MAX_MESSAGE_MEDIA, isEditable, useConversationThread } from '@/lib/messaging/use-conversation-thread'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { MessageBubble } from '@/components/messaging/message-bubble'
import { MediaPicker } from '@/components/messaging/media-picker'
import { cn } from '@/lib/utils'
import type { Conversation, ConversationListResponse } from '@/types/messaging'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
}

const conversationsKey = ['messaging', 'conversations'] as const
const messagesKey = (conversationId: string) => ['messaging', 'conversation-messages', conversationId] as const

export function ConversationsTab() {
  const t = useTranslations('messaging')
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [firstBody, setFirstBody] = useState('')
  const markedReadRef = useRef<Set<string>>(new Set())

  const { data: conversations, isLoading: isLoadingConversations, isError: isConversationsError, refetch: refetchConversations } = useQuery({
    queryKey: conversationsKey,
    queryFn: () => messagingApi.listConversations({ limit: 200 }).then((r) => r.data),
  })

  const { data: parentsData, isLoading: isLoadingParents, isError: isParentsError, refetch: refetchParents } = useQuery({
    queryKey: ['parents', 'list', { include_inactive: false }],
    queryFn: () => parentsApi.list({ include_inactive: false, limit: 200 }).then((r) => r.data),
    enabled: startDialogOpen,
  })

  const startMutation = useMutation({
    mutationFn: () =>
      messagingApi.startConversation({
        parent_id: selectedParentId!,
        body: firstBody.trim() || undefined,
      }).then((r) => r.data),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationListResponse | undefined>(conversationsKey, (old) => {
        const items = old?.items ?? []
        const exists = items.some((c) => c.id === conversation.id)
        const next = exists ? items : [conversation, ...items]
        return { total: (old?.total ?? 0) + (exists ? 0 : 1), items: next }
      })
      setSelectedId(conversation.id)
      setStartDialogOpen(false)
      setSelectedParentId(null)
      setFirstBody('')
      toast.success(t('conversations.created'))
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const markReadMutation = useMutation({
    mutationFn: (conversationId: string) => messagingApi.markConversationRead(conversationId),
    // Ajouté au ref UNIQUEMENT au succès : en cas d'échec on retente
    // (avant, le flag était posé avant l'appel — jamais retenté).
    onSuccess: (_data, conversationId) => {
      markedReadRef.current.add(conversationId)
      queryClient.invalidateQueries({ queryKey: conversationsKey })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  useEffect(() => {
    // Sécurité : si le fil n'est plus sélectionné, on oublie le marquage —
    // rouvrir la conversation remarque lu (le compteur a pu bouger).
    if (!selectedId) return
    const conv = conversations?.items.find((c) => c.id === selectedId)
    if (conv && conv.unread_count === 0) markedReadRef.current.delete(selectedId)
  }, [selectedId, conversations])

  const conversationItems = conversations?.items ?? []
  const selectedConversation = conversationItems.find((c) => c.id === selectedId) ?? null

  const listCard = (
    <Card className="lg:h-[600px]">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <p className="text-sm font-semibold text-primary">Conversations</p>
          <Button variant="outline" size="sm" onClick={() => setStartDialogOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            {t('conversations.new')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
        {isLoadingConversations ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : isConversationsError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-medium text-foreground">{t('conversations.loadError')}</p>
            <Button variant="outline" size="sm" onClick={() => refetchConversations()}>
              {t('conversations.retry')}
            </Button>
          </div>
        ) : conversationItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <MessagesSquare className="size-5" />
            </div>
            <p className="text-sm">{t('conversations.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {conversationItems.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 p-3 text-left text-sm transition-colors hover:bg-muted',
                    selectedId === conv.id && 'bg-muted'
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {conv.parent.nickname || `${conv.parent.first_name} ${conv.parent.last_name}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conv.last_message_at ? formatDateTime(conv.last_message_at) : t('conversations.noMessage')}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <Badge variant="default" className="shrink-0">{conv.unread_count}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </CardContent>
    </Card>
  )

  const threadCard = (
    <Card className="lg:h-[600px]">
      {!selectedId || !selectedConversation ? (
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <MessagesSquare className="size-8" />
          <p className="text-sm">{t('conversations.selectOne')}</p>
        </CardContent>
      ) : (
        <ConversationThread
          conversation={selectedConversation}
          markedReadRef={markedReadRef}
          markReadPending={markReadMutation.isPending}
          onMarkRead={(id) => markReadMutation.mutate(id)}
        />
      )}
    </Card>
  )

  return (
    <div className="space-y-4 pt-2">
      <div className="hidden gap-4 lg:grid lg:grid-cols-[320px_1fr]">
        {listCard}
        {threadCard}
      </div>

      <div className="lg:hidden">
        {selectedId && selectedConversation ? (
          <div className="space-y-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              {t('conversations.back')}
            </Button>
            <div className="h-[calc(100vh-16rem)]">{threadCard}</div>
          </div>
        ) : (
          listCard
        )}
      </div>

      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('conversations.newTitle')}</DialogTitle>
            <DialogDescription>{t('conversations.newHint')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isLoadingParents ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
              </div>
            ) : isParentsError ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="text-sm text-muted-foreground">{t('conversations.loadParentsError')}</p>
                <Button variant="outline" size="sm" onClick={() => refetchParents()}>
                  {t('conversations.retry')}
                </Button>
              </div>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {(parentsData?.items ?? []).map((parent) => (
                  <button
                    key={parent.id}
                    type="button"
                    onClick={() => setSelectedParentId(parent.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      selectedParentId === parent.id
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted'
                    )}
                  >
                    <span className="truncate font-medium">
                      {parent.nickname || `${parent.first_name} ${parent.last_name}`}
                    </span>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {t('conversations.childCount', { count: parent.children_count })}
                    </Badge>
                  </button>
                ))}
                {(parentsData?.items ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('conversations.noActiveParent')}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Textarea
                placeholder={t('conversations.firstMessage')}
                rows={3}
                value={firstBody}
                onChange={(e) => setFirstBody(e.target.value)}
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setStartDialogOpen(false)}>
                {t('conversations.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => startMutation.mutate()}
                disabled={!selectedParentId || startMutation.isPending}
              >
                {startMutation.isPending
                  ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('conversations.creating')}</>
                  : <><Send className="mr-1.5 size-4" /> {t('conversations.start')}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConversationThread({
  conversation, markedReadRef, markReadPending, onMarkRead,
}: {
  conversation: Conversation
  markedReadRef: React.RefObject<Set<string>>
  markReadPending: boolean
  onMarkRead: (conversationId: string) => void
}) {
  const t = useTranslations('messaging')
  const queryClient = useQueryClient()
  const thread = useConversationThread({
    messagesKey: messagesKey(conversation.id),
    conversationId: conversation.id,
    ownRole: 'admin',
    api: {
      list: (params) => messagingApi.listConversationMessages(conversation.id, params).then((r) => r.data),
      send: (text) => messagingApi.sendConversationMessage(conversation.id, text).then((r) => r.data),
      uploadBatch: (messageId, files) =>
        messagingApi.uploadMessageAttachments(conversation.id, messageId, files).then((r) => r.data),
      edit: (messageId, text) => messagingApi.editMessage(conversation.id, messageId, text).then((r) => r.data),
      remove: (messageId) => messagingApi.deleteMessage(conversation.id, messageId).then(() => undefined),
      removeAttachment: (messageId, attachmentId) =>
        messagingApi.removeMessageAttachment(conversation.id, messageId, attachmentId).then(() => undefined),
    },
    onThreadChanged: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
    onIncomingFromOther: () => markedReadRef.current?.delete(conversation.id),
  })

  // Marqué lu quand le fil est réellement affiché (messages chargés, en bas),
  // pas au simple clic sur la conversation — avec retry en cas d'échec.
  useEffect(() => {
    if (
      conversation.unread_count > 0 &&
      !thread.isLoading &&
      thread.isAtBottom &&
      !markedReadRef.current?.has(conversation.id) &&
      !markReadPending
    ) {
      onMarkRead(conversation.id)
    }
  }, [
    conversation.id,
    conversation.unread_count,
    thread.isLoading,
    thread.isAtBottom,
    markReadPending,
    markedReadRef,
    onMarkRead,
  ])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <p className="font-medium">
          {conversation.parent.nickname || `${conversation.parent.first_name} ${conversation.parent.last_name}`}
        </p>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div ref={thread.scrollRef} onScroll={thread.handleScroll} className="h-full space-y-3 overflow-y-auto p-4">
          {thread.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)}
            </div>
          ) : thread.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm font-medium text-foreground">{t('conversations.loadMessagesError')}</p>
              <Button variant="outline" size="sm" onClick={() => thread.refetchMessages()}>
                {t('conversations.retry')}
              </Button>
            </div>
          ) : (
            <>
              {thread.isLoadingOlder && (
                <div className="flex justify-center py-1">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {thread.messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">{t('conversations.noMessageYet')}</p>
              ) : (
                thread.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isMine={msg.sender_role === 'admin'}
                    editable={msg.sender_role === 'admin' && isEditable(msg)}
                    editing={thread.editingId === msg.id}
                    draft={thread.draft}
                    onDraftChange={thread.setDraft}
                    onStartEdit={() => thread.startEdit(msg)}
                    onCancelEdit={thread.cancelEdit}
                    onSaveEdit={thread.saveEdit}
                    editPending={thread.editPending}
                    onDelete={() => thread.deleteMessage(msg.id)}
                    deletePending={thread.deletingIds.includes(msg.id)}
                    onRemoveAttachment={(attachmentId) => thread.removeAttachment(msg.id, attachmentId)}
                    removingAttachmentId={thread.removingAttachmentId}
                  />
                ))
              )}
            </>
          )}
        </div>
        {thread.newCount > 0 && (
          <button
            type="button"
            onClick={thread.jumpToBottom}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg transition hover:bg-primary/90"
          >
            <ChevronDown className="size-3.5" />
            {thread.newCount} nouveau{thread.newCount > 1 ? 'x' : ''} message{thread.newCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {thread.pickerOpen && (
        <div className="border-t border-border p-3 pb-0">
          <MediaPicker files={thread.picked} onChange={thread.setPicked} max={MAX_MESSAGE_MEDIA} disabled={thread.busy} allowPdf={false} />
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <Textarea
            placeholder={t('conversations.replyPlaceholder')}
            rows={2}
            value={thread.body}
            onChange={(e) => thread.setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                thread.onSend()
              }
            }}
            className="w-full resize-none"
          />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <Button
            type="button"
            variant={thread.pickerOpen ? 'secondary' : 'ghost'}
            size="icon"
            className="h-10 w-10"
            aria-label={t('conversations.attachAria')}
            title={t('conversations.attachTitle')}
            onClick={() => thread.setPickerOpen((v) => !v)}
            disabled={thread.busy}
          >
            {thread.busy
              ? <Loader2 className="size-4 animate-spin" />
              : <Paperclip className="size-4" />}
          </Button>
          <Button type="button" className="h-10 w-10" onClick={thread.onSend} disabled={!thread.canSend} aria-label={t('send')}>
            {thread.busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
