'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Eye } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { messagingApi } from '@/lib/api/messaging.api'
import { intlLocale } from '@/lib/utils/locale-format'
import type { AnnouncementRecipient } from '@/types/messaging'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Registre d'une diffusion : toute l'audience, état par parent.
 *
 * ⚠️ La liste part de l'AUDIENCE, pas des accusés de lecture — et l'ordre
 * vient du serveur (sans trace d'abord, signataires en dernier). Re-trier ici
 * par nom ferait perdre exactement l'information utile : qui reste à relancer.
 *
 * Chargé à l'OUVERTURE seulement (`enabled: open`) : c'est une liste
 * nominative, inutile de la rapatrier pour chaque diffusion affichée.
 */
export function AnnouncementRecipientsDialog({
  announcementId,
  open,
  onOpenChange,
}: {
  announcementId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('messaging')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['messaging', 'announcements', announcementId, 'recipients'],
    queryFn: () => messagingApi.listAnnouncementRecipients(announcementId).then((r) => r.data),
    enabled: open,
  })

  const items = data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('announcements.registerTitle')}</DialogTitle>
          <DialogDescription>{t('announcements.registerHint')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">{t('announcements.registerLoadError')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('announcements.registerEmpty')}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="font-normal">
                {t('announcements.readRatio', { read: data?.read_count ?? 0, total: data?.total ?? 0 })}
              </Badge>
              {data?.requires_signature && (
                <Badge variant="outline" className="font-normal">
                  {t('announcements.signatureRatio', {
                    signed: data?.signature_count ?? 0, total: data?.total ?? 0,
                  })}
                </Badge>
              )}
            </div>
            <ul className="divide-y">
              {items.map((r) => <RecipientRow key={r.parent.id} recipient={r} />)}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecipientRow({ recipient }: { recipient: AnnouncementRecipient }) {
  const t = useTranslations('messaging')
  const { parent, email, read_at, signed_at, signed_name } = recipient
  const name = parent.nickname || `${parent.first_name} ${parent.last_name}`

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{name}</p>
        <p className="break-all text-xs text-muted-foreground">{email}</p>
        {signed_at && signed_name && (
          // Le nom TAPÉ, pas celui du compte : un écart doit se voir — l'admin
          // est seul à pouvoir juger si « Mme Koffi » signe pour « Awa Koffi ».
          <p className="break-words text-xs text-muted-foreground">
            {t('announcements.signedAs', { name: signed_name })}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {signed_at ? (
          <Badge className="whitespace-nowrap">
            <CheckCircle2 className="mr-1 size-3.5" />
            {t('announcements.stateSigned')}
          </Badge>
        ) : read_at ? (
          <Badge variant="secondary" className="whitespace-nowrap">
            <Eye className="mr-1 size-3.5" />
            {t('announcements.stateRead')}
          </Badge>
        ) : (
          <Badge variant="outline" className="whitespace-nowrap text-muted-foreground">
            <Circle className="mr-1 size-3.5" />
            {t('announcements.stateNothing')}
          </Badge>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {signed_at ? formatDateTime(signed_at) : read_at ? formatDateTime(read_at) : null}
        </p>
      </div>
    </li>
  )
}
