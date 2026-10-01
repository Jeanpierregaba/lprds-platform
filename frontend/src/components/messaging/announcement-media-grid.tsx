'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Download, ImageOff, Loader2, Play,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { messagingApi } from '@/lib/api/messaging.api'
import { downloadBlob } from '@/lib/utils/download'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { useAttachmentBlob } from '@/lib/messaging/use-attachment-blob'
import { FileDownloadButton } from './message-attachments'
import type { Attachment } from '@/types/messaging'

const isPreviewable = (att: Attachment) =>
  att.content_type.startsWith('image/') || att.content_type.startsWith('video/')

/**
 * Médias d'une diffusion : frames carrés de taille fixe (média recadré en
 * `cover`), grille 2 colonnes dès 2 médias, badge « +N » au-delà de 4.
 * Un clic ouvre le carrousel à l'index cliqué. Les non-images (PDF) restent
 * des boutons de téléchargement sous la grille.
 */
export function AnnouncementMediaGrid({ attachments }: { attachments: Attachment[] }) {
  const media = attachments.filter(isPreviewable)
  const files = attachments.filter((att) => !isPreviewable(att))
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (attachments.length === 0) return null

  const visible = media.slice(0, 4)
  const extra = media.length - visible.length

  return (
    <div className="space-y-2">
      {media.length > 0 && (
        <div className="max-w-xl">
          <div
            className={cn(
              'grid gap-1.5',
              // 1 média : frame unique plafonné (~280 px) ; 2 : 2 colonnes
              // partout ; 3+ : 2 colonnes sur mobile, 3 sur desktop.
              media.length === 1 && 'max-w-70',
              media.length === 2 && 'grid-cols-2',
              media.length >= 3 && 'grid-cols-2 sm:grid-cols-3',
            )}
          >
            {visible.map((att, i) => (
              <MediaFrame
                key={att.id}
                attachment={att}
                onOpen={() => setViewerIndex(media.indexOf(att))}
                overlay={
                  i === visible.length - 1 && extra > 0 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-2xl font-semibold text-white">
                      +{extra}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
      {files.map((att) => (
        <FileDownloadButton key={att.id} attachment={att} highlight={false} />
      ))}
      {viewerIndex !== null && (
        <AnnouncementMediaViewer
          media={media}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}

function MediaFrame({
  attachment: att,
  onOpen,
  overlay,
}: {
  attachment: Attachment
  onOpen: () => void
  overlay?: React.ReactNode
}) {
  const t = useTranslations('messaging')
  const { url, isLoading, isError } = useAttachmentBlob(att.id)
  const isVideo = att.content_type.startsWith('video/')

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('media.viewNamed', { name: att.filename })}
      className="group relative block aspect-square w-full overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:ring-primary"
    >
      {isLoading ? (
        <span className="flex size-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </span>
      ) : isError || !url ? (
        <span className="flex size-full items-center justify-center">
          <ImageOff className="size-5 text-muted-foreground" />
        </span>
      ) : isVideo ? (
        <>
          <video src={url} muted playsInline preload="metadata" className="size-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/60 p-2 text-white transition group-hover:bg-black/80">
              <Play className="size-5 fill-current" />
            </span>
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      )}
      {overlay}
    </button>
  )
}

function AnnouncementMediaViewer({
  media,
  index,
  onIndexChange,
  onClose,
}: {
  media: Attachment[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const t = useTranslations('messaging')
  const tCommon = useTranslations('common')
  // Index borné : la liste peut rétrécir pendant que le viewer est ouvert
  // (suppression) — sans ça `att` devient undefined après les hooks.
  const safeIndex = media.length === 0 ? 0 : index % media.length
  const att = media[safeIndex]
  const { url } = useAttachmentBlob(att?.id ?? null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndexChange((safeIndex + 1) % media.length)
      else if (e.key === 'ArrowLeft') onIndexChange((safeIndex - 1 + media.length) % media.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [safeIndex, media.length, onClose, onIndexChange])

  const onDownload = async () => {
    if (!att) return
    try {
      // Réutilise le blob déjà en cache quand il est chargé (pas de 2e GET).
      const blob = url
        ? await fetch(url).then((r) => r.blob())
        : (await messagingApi.downloadAttachment(att.id)).data
      downloadBlob(blob, att.filename)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!att) return null
  const isVideo = att.content_type.startsWith('video/')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('media.viewerTitle', { index: safeIndex + 1, total: media.length })}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('carouselHint')}</DialogDescription>
        </DialogHeader>

        <div className="flex h-[50dvh] items-center justify-center overflow-hidden rounded-md bg-black">
          {url && (
            isVideo ? (
              <video key={att.id} src={url} controls preload="metadata" className="max-h-full max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="max-h-full max-w-full object-contain" />
            )
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => onIndexChange((safeIndex - 1 + media.length) % media.length)}
              disabled={media.length < 2}
              aria-label={t('media.prev')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => onIndexChange((safeIndex + 1) % media.length)}
              disabled={media.length < 2}
              aria-label={t('media.next')}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button type="button" variant="outline" className="h-10" onClick={onDownload}>
            <Download className="mr-1.5 size-4" />
            {tCommon('actions.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
