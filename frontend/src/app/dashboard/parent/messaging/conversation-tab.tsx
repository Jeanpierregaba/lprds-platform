'use client'

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Paperclip, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { messagingApi } from '@/lib/api/messaging.api'
import { MAX_MESSAGE_MEDIA, isEditable, useConversationThread } from '@/lib/messaging/use-conversation-thread'
import { MessageBubble } from '@/components/messaging/message-bubble'
import { MediaPicker } from '@/components/messaging/media-picker'
import { cn } from '@/lib/utils'

const conversationKey = ['parent', 'conversation-me'] as const
const messagesKey = ['parent', 'conversation-me-messages'] as const

export function ConversationTab() {
  const queryClient = useQueryClient()
  const markedReadRef = useRef(false)

  const { data: conversation } = useQuery({
    queryKey: conversationKey,
    queryFn: () => messagingApi.getMyConversation().then((r) => r.data),
  })

  const thread = useConversationThread({
    messagesKey,
    conversationId: conversation?.id,
    ownRole: 'parent',
    api: {
      list: (params) => messagingApi.listMyMessages(params).then((r) => r.data),
      send: (text) => messagingApi.sendMyMessage(text).then((r) => r.data),
      uploadBatch: (messageId, files) =>
        messagingApi.uploadMyMessageAttachments(messageId, files).then((r) => r.data),
      edit: (messageId, text) => messagingApi.editMyMessage(messageId, text).then((r) => r.data),
      remove: (messageId) => messagingApi.deleteMyMessage(messageId).then(() => undefined),
      removeAttachment: (messageId, attachmentId) =>
        messagingApi.removeMyMessageAttachment(messageId, attachmentId).then(() => undefined),
    },
    onThreadChanged: () => queryClient.invalidateQueries({ queryKey: conversationKey }),
    onIncomingFromOther: () => {
      markedReadRef.current = false
    },
  })

  const markReadMutation = useMutation({
    mutationFn: () => messagingApi.markMyConversationRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKey }),
  })

  useEffect(() => {
    if (conversation && conversation.unread_count > 0 && !markedReadRef.current) {
      markedReadRef.current = true
      markReadMutation.mutate()
    }
  }, [conversation, markReadMutation])

  return (
    <Card className={cn('h-[calc(100vh-16rem)] pt-2 lg:h-[600px]')}>
      <CardContent className="flex h-full flex-col p-0">
        <div className="relative flex-1 overflow-hidden">
          <div ref={thread.scrollRef} onScroll={thread.handleScroll} className="h-full space-y-3 overflow-y-auto p-4">
            {thread.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)}
              </div>
            ) : (
              <>
                {thread.isLoadingOlder && (
                  <div className="flex justify-center py-1">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {thread.messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Aucun message pour l&apos;instant. Écrivez à l&apos;établissement ci-dessous.
                  </p>
                ) : (
                  thread.messages.map((msg) => {
                    const isMine = msg.sender_role === 'parent'
                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isMine={isMine}
                        editable={isMine && isEditable(msg)}
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
                    )
                  })
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
            <MediaPicker files={thread.picked} onChange={thread.setPicked} max={MAX_MESSAGE_MEDIA} disabled={thread.busy} />
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            placeholder="Écrire à l'établissement..."
            rows={2}
            value={thread.body}
            onChange={(e) => thread.setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                thread.onSend()
              }
            }}
            className="flex-1 resize-none"
          />
          <div className="flex flex-col items-center gap-1">
            <Button
              type="button"
              variant={thread.pickerOpen ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="Joindre des photos ou vidéos"
              title="Joindre des photos ou vidéos (avec aperçu avant envoi)"
              onClick={() => thread.setPickerOpen((v) => !v)}
              disabled={thread.busy}
            >
              {thread.busy
                ? <Loader2 className="size-4 animate-spin" />
                : <Paperclip className="size-4" />}
            </Button>
            <Button type="button" onClick={thread.onSend} disabled={!thread.canSend}>
              {thread.busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
