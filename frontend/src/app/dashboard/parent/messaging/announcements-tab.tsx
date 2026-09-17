'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AnnouncementMediaGrid } from '@/components/messaging/announcement-media-grid'
import { messagingApi } from '@/lib/api/messaging.api'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import type { Announcement } from '@/types/messaging'

const key = ['parent', 'announcements'] as const

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AnnouncementsTab() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => messagingApi.listAnnouncements({ limit: 100 }).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  useMessagingEvent((event) => {
    if (event.type === 'announcement' || event.type === 'announcement_attachment') invalidate()
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => messagingApi.markAnnouncementRead(id),
    onSuccess: () => invalidate(),
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-3 pt-2">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="size-5" />
            </div>
            <p className="font-medium text-foreground">Aucune diffusion pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        items.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            onOpen={() => { if (!a.is_read) markReadMutation.mutate(a.id) }}
          />
        ))
      )}
    </div>
  )
}

function AnnouncementCard({ announcement, onOpen }: { announcement: Announcement; onOpen: () => void }) {
  return (
    <Card
      className={!announcement.is_read ? 'border-primary/50' : undefined}
      onMouseEnter={onOpen}
      onClick={onOpen}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{announcement.title}</CardTitle>
            <CardDescription>
              {announcement.created_by.nickname || `${announcement.created_by.first_name} ${announcement.created_by.last_name}`}
              {' · '}{formatDateTime(announcement.created_at)}
            </CardDescription>
          </div>
          {!announcement.is_read && <Badge variant="default" className="shrink-0">Nouveau</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>

        <div onClick={(e) => e.stopPropagation()}>
          <AnnouncementMediaGrid attachments={announcement.attachments} />
        </div>
      </CardContent>
    </Card>
  )
}
