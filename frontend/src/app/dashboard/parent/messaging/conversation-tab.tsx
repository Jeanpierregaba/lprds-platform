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
import { MessageAttachments } from '@/components/messaging/message-attachments'
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
  const composeFileRef = useRef<HTMLInputElement>(null)
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

  const appendMessage = (message: MessageListResponse['items'][number]) =>
    queryClient.setQueryData<MessageListResponse | undefined>(messagesKey, (old) =>
      old
        ? old.items.some((m) => m.id === message.id)
          ? old
          : { total: old.total + 1, items: [...old.items, message] }
        : old
    )

  useMessagingEvent((event) => {
    if (event.type === 'message' && event.conversation_id === conversation?.id) {
      appendMessage(event)
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
      appendMessage(message)
      setBody('')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  // Envoi « comme un message » : le fichier choisi dans la barre de saisie crée
  // un message (texte éventuel + corps vide sinon) puis y attache le média.
  const sendMediaMutation = useMutation({
    mutationFn: async (file: File) => {
      const message = await messagingApi.sendMyMessage(body.trim()).then((r) => r.data)
      await messagingApi.uploadMyMessageAttachment(message.id, file)
      return message
    },
    onSuccess: (message) => {
      appendMessage(message)
      setBody('')
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
    <Card className="h-[calc(100vh-16rem)] pt-2 lg:h-[600px]">
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
                    {msg.body ? <p className="whitespace-pre-wrap">{msg.body}</p> : null}
                    <MessageAttachments attachments={msg.attachments} highlight={isMine} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                    <span>{formatTime(msg.created_at)}</span>
                    {isMine && msg.read_at && <span>· Vu</span>}
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
          <div className="flex flex-col items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Envoyer une photo ou une vidéo"
              title="Envoyer une photo ou une vidéo"
              onClick={() => composeFileRef.current?.click()}
              disabled={sendMediaMutation.isPending}
            >
              {sendMediaMutation.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <Paperclip className="size-4" />}
            </Button>
            <Button type="button" onClick={onSend} disabled={sendMutation.isPending || !body.trim()}>
              {sendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          <input
            ref={composeFileRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) sendMediaMutation.mutate(file)
              e.target.value = ''
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
