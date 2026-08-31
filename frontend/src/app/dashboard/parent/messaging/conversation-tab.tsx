'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Paperclip, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { messagingApi } from '@/lib/api/messaging.api'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { cn } from '@/lib/utils'
import type { MessageListResponse } from '@/types/messaging'

const conversationKey = ['parent', 'conversation-me'] as const
const messagesKey = ['parent', 'conversation-me-messages'] as const

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function ConversationTab() {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({})
  const markedReadRef = useRef(false)

  const { data: conversation } = useQuery({
    queryKey: conversationKey,
    queryFn: () => messagingApi.getMyConversation().then((r) => r.data),
  })

  const { data: messagesData, isLoading } = useQuery({
    queryKey: messagesKey,
    queryFn: () => messagingApi.listMyMessages({ limit: 200 }).then((r) => r.data),
  })

  const messages = messagesData?.items ?? []

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

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

  useMessagingEvent((event) => {
    if (event.type === 'message' && event.conversation_id === conversation?.id) {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old ? { total: old.total + 1, items: [...old.items, event] } : old
      )
      if (event.sender_role !== 'parent') markedReadRef.current = false
    } else if (event.type === 'read_receipt' && event.conversation_id === conversation?.id) {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old
          ? { ...old, items: old.items.map((m) => (event.message_ids.includes(m.id) ? { ...m, read_at: event.read_at } : m)) }
          : old
      )
    } else if (event.type === 'attachment') {
      queryClient.invalidateQueries({ queryKey: messagesKey })
    }
  })

  const sendMutation = useMutation({
    mutationFn: (text: string) => messagingApi.sendMyMessage(text).then((r) => r.data),
    onSuccess: (message) => {
      queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
        old ? { total: old.total + 1, items: [...old.items, message] } : old
      )
      setBody('')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const attachMutation = useMutation({
    mutationFn: ({ messageId, file }: { messageId: string; file: File }) =>
      messagingApi.uploadMyMessageAttachment(messageId, file),
    onSuccess: () => {
      toast.success('Pièce jointe ajoutée.')
      queryClient.invalidateQueries({ queryKey: messagesKey })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onSend = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    sendMutation.mutate(trimmed)
  }

  return (
    <Card className="pt-2 lg:h-[600px]">
      <CardContent className="flex h-full flex-col p-0">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Aucun message pour l&apos;instant. Écrivez à l&apos;établissement ci-dessous.
            </p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_role === 'parent'
              return (
                <div key={msg.id} className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                      isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    {msg.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        className={cn(
                          'mt-1.5 flex items-center gap-1.5 rounded border px-2 py-1 text-xs underline-offset-2 hover:underline',
                          isMine ? 'border-primary-foreground/30' : 'border-border'
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
                    {isMine && msg.read_at && <span>· Vu</span>}
                    {isMine && (
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
            placeholder="Écrire à l'établissement..."
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
      </CardContent>
    </Card>
  )
}
