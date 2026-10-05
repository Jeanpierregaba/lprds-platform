'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AnnouncementMediaGrid } from '@/components/messaging/announcement-media-grid'
import { messagingApi } from '@/lib/api/messaging.api'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import type { Announcement, AnnouncementListResponse } from '@/types/messaging'

const key = ['parent', 'announcements'] as const

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function AnnouncementsTab() {
  const t = useTranslations('messaging')
  const queryClient = useQueryClient()
  // Garde anti-double : un POST /read par diffusion (le cache peut être
  // stale entre le clic et l'invalidate).
  const pendingRef = useRef<Set<string>>(new Set())

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => messagingApi.listAnnouncements({ limit: 200 }).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  useMessagingEvent((event) => {
    if (event.type === 'announcement' || event.type === 'announcement_attachment') invalidate()
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => messagingApi.markAnnouncementRead(id),
    // Optimiste : le badge « Nouveau » disparaît aussitôt, le serveur
    // confirme en arrière-plan (retry possible en cas d'échec).
    onMutate: (id) => {
      queryClient.setQueryData<AnnouncementListResponse | undefined>(key, (old) =>
        old ? { ...old, items: old.items.map((a) => (a.id === id ? { ...a, is_read: true } : a)) } : old
      )
    },
    onSuccess: () => invalidate(),
    onError: () => invalidate(),
  })

  const items = data?.items ?? []

  const handleOpen = (a: Announcement) => {
    if (a.is_read || pendingRef.current.has(a.id) || markReadMutation.isPending) return
    pendingRef.current.add(a.id)
    markReadMutation.mutate(a.id, {
      onSettled: () => pendingRef.current.delete(a.id),
    })
  }

  return (
    <div className="space-y-3 pt-2">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
      ) : isError ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium text-foreground">{t('announcements.loadError')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t('conversations.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="size-5" />
            </div>
            <p className="font-medium text-foreground">{t('announcements.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        items.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            onOpen={() => handleOpen(a)}
          />
        ))
      )}
    </div>
  )
}

function AnnouncementCard({ announcement, onOpen }: { announcement: Announcement; onOpen: () => void }) {
  const t = useTranslations('messaging')

  return (
    // Marquage au clic uniquement (jamais au survol : un survol n'est pas
    // une lecture) — le bouton natif couvre aussi le clavier.
    <Card
      className={!announcement.is_read ? 'border-primary/50' : undefined}
      onClick={onOpen}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="break-words text-base">{announcement.title}</CardTitle>
            <CardDescription>
              {announcement.created_by.nickname || `${announcement.created_by.first_name} ${announcement.created_by.last_name}`}
              {' · '}{formatDateTime(announcement.created_at)}
            </CardDescription>
          </div>
          {!announcement.is_read && <Badge variant="default" className="shrink-0">{t('announcements.newBadge')}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{announcement.body}</p>

        <div onClick={(e) => e.stopPropagation()}>
          <AnnouncementMediaGrid attachments={announcement.attachments} />
        </div>
      </CardContent>
    </Card>
  )
}
