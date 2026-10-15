'use client'

import { useTranslations } from 'next-intl'

import { Download, Loader2 } from 'lucide-react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MediaThumb } from './media-thumb'
import { galleryApi } from '@/lib/api/gallery.api'
import { downloadBlob } from '@/lib/utils/download'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { type GalleryMediaItem } from '@/types/gallery'
import { toast } from 'sonner'
import { useState } from 'react'
import { displayName } from '@/lib/utils/display-name'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'long', timeStyle: 'short' })
}

export function MediaLightbox({
  item, onOpenChange,
}: { item: GalleryMediaItem | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('gallery')
  const tCommon = useTranslations('common')
  const gallerySourceBadgesLabel = useLabel('gallerySourceBadges')
  const reportTypesLabel = useLabel('reportTypes')
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-words" title={item.filename}>{item.filename}</DialogTitle>
          <DialogDescription>{formatDateTime(item.created_at)}</DialogDescription>
        </DialogHeader>

        <MediaThumb item={item} controls className="max-h-[50dvh] w-full rounded-md" />

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{gallerySourceBadgesLabel(item.source)}</Badge>
          {item.report_type && <Badge variant="outline">{reportTypesLabel(item.report_type)}</Badge>}
          {item.announcement_title && <Badge variant="outline">{t('lightbox.announcement', { title: item.announcement_title })}</Badge>}
          {item.child && <Badge variant="outline">{item.child.first_names} {item.child.last_name}</Badge>}
          {item.conversation_parent && (
            <Badge variant="outline">{t('lightbox.parent', { name: displayName(item.conversation_parent) })}</Badge>
          )}
          <Badge variant="outline">
            {t('lightbox.uploadedBy', { name: displayName(item.uploaded_by) })}
          </Badge>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={onDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
            {tCommon('actions.download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
