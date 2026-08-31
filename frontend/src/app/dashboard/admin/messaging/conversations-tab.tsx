'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, MessagesSquare, Paperclip, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { messagingApi } from '@/lib/api/messaging.api'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { cn } from '@/lib/utils'
import type { Conversation, Message, MessageListResponse } from '@/types/messaging'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const conversationsKey = ['messaging', 'conversations'] as const
const messagesKey = (conversationId: string) => ['messaging', 'conversation-messages', conversationId] as const

export function ConversationsTab() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const markedReadRef = useRef<Set<string>>(new Set())

  const { data: conversations, isLoading: isLoadingConversations } = useQuery({
    queryKey: conversationsKey,
    queryFn: () => messagingApi.listConversations({ limit: 100 }).then((r) => r.data),
  })

  const { data: messagesData, isLoading: isLoadingMessages } = useQuery({
    queryKey: selectedId ? messagesKey(selectedId) : ['messaging', 'conversation-messages', 'none'],
    queryFn: () => messagingApi.listConversationMessages(selectedId!).then((r) => r.data),
    enabled: !!selectedId,
  })

  const markReadMutation = useMutation({
    mutationFn: (conversationId: string) => messagingApi.markConversationRead(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
  })

  useEffect(() => {
    const conv = conversations?.items.find((c) => c.id === selectedId)
    if (selectedId && conv && conv.unread_count > 0 && !markedReadRef.current.has(selectedId)) {
      markedReadRef.current.add(selectedId)
      markReadMutation.mutate(selectedId)
    }
  }, [selectedId, conversations, markReadMutation])

  useMessagingEvent((event) => {
    if (event.type === 'message') {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey(event.conversation_id), (old) =>
        old ? { total: old.total + 1, items: [...old.items, event] } : old
      )
      queryClient.invalidateQueries({ queryKey: conversationsKey })
      if (event.conversation_id === selectedId && event.sender_role !== 'admin') {
        markedReadRef.current.delete(event.conversation_id)
      }
    } else if (event.type === 'read_receipt') {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey(event.conversation_id), (old) =>
        old
          ? { ...old, items: old.items.map((m) => (event.message_ids.includes(m.id) ? { ...m, read_at: event.read_at } : m)) }
          : old
      )
      queryClient.invalidateQueries({ queryKey: conversationsKey })
    } else if (event.type === 'attachment') {
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'messaging' && q.queryKey[1] === 'conversation-messages',
      })
    }
  })

  const conversationItems = conversations?.items ?? []
  const selectedConversation = conversationItems.find((c) => c.id === selectedId) ?? null

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[320px_1fr]">
      <Card className="lg:h-[600px]">
        <CardContent className="h-full overflow-y-auto p-0">
          {isLoadingConversations ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : conversationItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <MessagesSquare className="size-5" />
              </div>
              <p className="text-sm">Aucune conversation pour le moment.</p>
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
                        {conv.last_message_at ? formatDateTime(conv.last_message_at) : 'Aucun message'}
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
        </CardContent>
      </Card>

      <Card className="lg:h-[600px]">
        {!selectedId || !selectedConversation ? (
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <MessagesSquare className="size-8" />
            <p className="text-sm">Sélectionnez une conversation.</p>
          </CardContent>
        ) : (
          <ConversationThread
            conversation={selectedConversation}
            messages={messagesData?.items ?? []}
            isLoading={isLoadingMessages}
          />
        )}
      </Card>
    </div>
  )
}

function ConversationThread({
  conversation, messages, isLoading,
}: { conversation: Conversation; messages: Message[]; isLoading: boolean }) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: (text: string) => messagingApi.sendConversationMessage(conversation.id, text).then((r) => r.data),
    onSuccess: (message) => {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey(conversation.id), (old) =>
        old ? { total: old.total + 1, items: [...old.items, message] } : old
      )
      queryClient.invalidateQueries({ queryKey: conversationsKey })
      setBody('')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const attachMutation = useMutation({
    mutationFn: ({ messageId, file }: { messageId: string; file: File }) =>
      messagingApi.uploadConversationAttachment(conversation.id, messageId, file),
    onSuccess: () => {
      toast.success('Pièce jointe ajoutée.')
      queryClient.invalidateQueries({ queryKey: messagesKey(conversation.id) })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onSend = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    sendMutation.mutate(trimmed)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <p className="font-medium">
          {conversation.parent.nickname || `${conversation.parent.first_name} ${conversation.parent.last_name}`}
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Aucun message pour l&apos;instant.</p>
        ) : (
          messages.map((msg) => {
            const isAdmin = msg.sender_role === 'admin'
            return (
              <div key={msg.id} className={cn('flex flex-col', isAdmin ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                    isAdmin ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  {msg.attachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      className={cn(
                        'mt-1.5 flex items-center gap-1.5 rounded border px-2 py-1 text-xs underline-offset-2 hover:underline',
                        isAdmin ? 'border-primary-foreground/30' : 'border-border'
                      )}
                      onClick={async () => {
                        try {
                          const res = await messagingApi.downloadAttachment(att.id)
                          downloadBlob(res.data, att.filename)
                        } catch (err) {
                          toast.error(getApiErrorMessage(err))
                        }
                      }}
                    >
                      <Paperclip className="size-3" />
                      {att.filename}
                    </button>
                  ))}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <span>{formatTime(msg.created_at)}</span>
                  {isAdmin && msg.read_at && <span>· Vu</span>}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => fileInputsRef.current[msg.id]?.click()}
                      className="hover:text-foreground"
                      aria-label="Joindre un fichier à ce message"
                    >
                      <Paperclip className="size-3" />
                    </button>
                  )}
                  <input
                    ref={(el) => { fileInputsRef.current[msg.id] = el }}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) attachMutation.mutate({ messageId: msg.id, file })
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          placeholder="Répondre au nom de l'administration..."
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          className="flex-1 resize-none"
        />
        <Button type="button" onClick={onSend} disabled={sendMutation.isPending || !body.trim()}>
          {sendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
