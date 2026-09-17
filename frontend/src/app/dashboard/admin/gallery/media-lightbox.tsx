'use client'

import { Download, Loader2 } from 'lucide-react'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MediaThumb } from './media-thumb'
import { galleryApi } from '@/lib/api/gallery.api'
import { downloadBlob } from '@/lib/utils/download'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { REPORT_TYPE_LABELS } from '@/types/reports'
import { GALLERY_SOURCE_BADGE_LABEL, type GalleryMediaItem } from '@/types/gallery'
import { toast } from 'sonner'
import { useState } from 'react'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
}

export function MediaLightbox({
  item, onOpenChange,
}: { item: GalleryMediaItem | null; onOpenChange: (open: boolean) => void }) {
  const [isDownloading, setIsDownloading] = useState(false)

  if (!item) return null

  const onDownload = async () => {
    setIsDownloading(true)
    try {
      const res = await galleryApi.download(item.url)
      downloadBlob(res.data, item.filename)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{item.filename}</DialogTitle>
          <DialogDescription>{formatDateTime(item.created_at)}</DialogDescription>
        </DialogHeader>

        <MediaThumb item={item} controls className="max-h-[60vh] w-full rounded-md" />

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{GALLERY_SOURCE_BADGE_LABEL[item.source]}</Badge>
          {item.report_type && <Badge variant="outline">{REPORT_TYPE_LABELS[item.report_type]}</Badge>}
          {item.announcement_title && <Badge variant="outline">Diffusion : {item.announcement_title}</Badge>}
          {item.child && <Badge variant="outline">{item.child.first_names} {item.child.last_name}</Badge>}
          {item.conversation_parent && (
            <Badge variant="outline">Parent : {item.conversation_parent.first_name} {item.conversation_parent.last_name}</Badge>
          )}
          <Badge variant="outline">
            Envoyé par {item.uploaded_by.nickname ?? `${item.uploaded_by.first_name} ${item.uploaded_by.last_name}`}
          </Badge>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={onDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
            Télécharger
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
