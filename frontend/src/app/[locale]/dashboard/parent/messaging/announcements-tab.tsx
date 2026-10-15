'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AnnouncementMediaGrid } from '@/components/messaging/announcement-media-grid'
import { AnnouncementSignature } from '@/components/messaging/announcement-signature'
import { AnnouncementToggle } from '@/components/messaging/announcement-toggle'
import { AnnouncementCollapse } from '@/components/messaging/announcement-collapse'
import { cn } from '@/lib/utils/cn'
import { messagingApi } from '@/lib/api/messaging.api'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import type { Announcement, AnnouncementListResponse } from '@/types/messaging'
import { displayName } from '@/lib/utils/display-name'

const key = ['parent', 'announcements'] as const

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function AnnouncementsTab({ focusId }: { focusId?: string | null }) {
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
            focused={a.id === focusId}
            onOpen={() => handleOpen(a)}
            onSigned={invalidate}
          />
        ))
      )}
    </div>
  )
}

function AnnouncementCard({
  announcement, focused = false, onOpen, onSigned,
}: {
  announcement: Announcement
  /** Diffusion désignée par l'URL (bouton d'un email, tapotement d'un push). */
  focused?: boolean
  onOpen: () => void
  onSigned: () => void
}) {
  const t = useTranslations('messaging')
  // ⚠️ Ce qui est replié par défaut, c'est ce qui est DÉJÀ TRAITÉ. Tout replier
  // ferait disparaître une diffusion jamais lue derrière un chevron, et une
  // signature attendue avec elle — or c'est précisément ce qu'il ne faut pas
  // manquer. L'état initial se calcule donc à partir de la diffusion, pas d'un
  // réglage global.
  const [open, setOpen] = useState(
    focused ||
    !announcement.is_read ||
    (announcement.requires_signature && !announcement.is_signed)
  )
  const bodyId = `announcement-body-${announcement.id}`
  const cardRef = useRef<HTMLDivElement>(null)

  // Amener la diffusion visée sous les yeux. Déplier ne suffit pas : elle peut
  // être la trentième de la liste, donc hors écran — le parent qui vient de
  // cliquer le bouton de son email verrait s'ouvrir la diffusion la plus
  // RÉCENTE et conclurait que le lien l'a mal mené.
  //
  // Trois détails, tous mesurés à l'écran et tous invisibles au type-check :
  //  1. **pas au montage** — les cartes se déplient en 240 ms, et défiler
  //     pendant vise une position que l'animation déplace aussitôt (la carte
  //     finissait 38 px au-dessus du bord, titre coupé) ;
  //  2. **jamais `behavior: 'smooth'`** — un défilement animé est
  //     interruptible, et le moindre changement de disposition pendant ses
  //     ~400 ms l'annule SANS rien signaler : minuteur bien tiré, page restée
  //     en haut ;
  //  3. **le drapeau se pose DANS le minuteur**, jamais avant — en
  //     développement React monte deux fois, et le poser tout de suite faisait
  //     annuler le premier minuteur par le nettoyage puis écarter le second
  //     par le drapeau, donc plus aucun défilement du tout.
  //
  // Le drapeau lui-même évite de rejouer le défilement à chaque invalidation
  // du cache (le marquage « lu » en déclenche une aussitôt).
  const amene = useRef(false)
  useEffect(() => {
    if (!focused || amene.current) return
    const minuteur = setTimeout(() => {
      amene.current = true
      cardRef.current?.scrollIntoView({ block: 'start' })
    }, 300)
    return () => clearTimeout(minuteur)
  }, [focused])

  return (
    // Marquage au clic uniquement (jamais au survol : un survol n'est pas
    // une lecture) — le bouton natif couvre aussi le clavier.
    <Card
      ref={cardRef}
      // Le liseré dit « c'est bien celle-ci » : sans lui, le défilement amène
      // au bon endroit sans que rien ne désigne la diffusion annoncée.
      className={cn(
        focused && 'scroll-mt-4 ring-2 ring-primary/60',
        !announcement.is_read && 'border-primary/50',
      )}
      onClick={onOpen}
    >
      <CardHeader>
        {/* Deux rangées, même raison que côté admin : un groupe de badges en
            `shrink-0` sur la ligne du titre lui laisse une poignée de pixels
            sur un téléphone. */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="break-words text-base">{announcement.title}</CardTitle>
            <CardDescription>
              {displayName(announcement.created_by)}
              {' · '}{formatDateTime(announcement.created_at)}
            </CardDescription>
          </div>
          <AnnouncementToggle
            open={open}
            onToggle={() => setOpen((v) => !v)}
            controls={bodyId}
          />
        </div>
        {/* Les badges restent visibles REPLIÉ : c'est ce qui permet de repérer,
            dans une liste fermée, ce qui demande encore quelque chose. */}
        {(announcement.requires_signature && !announcement.is_signed) || !announcement.is_read ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {announcement.requires_signature && !announcement.is_signed && (
              <Badge variant="outline" className="whitespace-nowrap border-primary/60 text-primary">
                {t('announcements.signatureBadge')}
              </Badge>
            )}
            {!announcement.is_read && <Badge variant="default">{t('announcements.newBadge')}</Badge>}
          </div>
        ) : null}
      </CardHeader>
      <AnnouncementCollapse open={open} id={bodyId}>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{announcement.body}</p>

          <div onClick={(e) => e.stopPropagation()}>
            <AnnouncementMediaGrid attachments={announcement.attachments} />
          </div>

          <AnnouncementSignature announcement={announcement} onSigned={onSigned} />
        </CardContent>
      </AnnouncementCollapse>
    </Card>
  )
}
