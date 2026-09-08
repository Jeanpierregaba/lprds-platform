'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AuthMedia } from '@/components/media/auth-media'
import { downloadBlob } from '@/lib/utils/download'
import { getApiErrorMessage } from '@/lib/utils/api-error'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1024 ** 2).toFixed(1)} Mo`
}

/** Affiche une pièce jointe d'un rapport (image/vidéo) en grand, avec lecture
 *  vidéo et bouton de téléchargement. Le contenu est récupéré via un
 *  fetchBlob authentifié, comme partout ailleurs dans l'application. */
export function AttachmentLightbox({
  filename,
  contentType,
  sizeBytes,
  fetchBlob,
  onOpenChange,
}: {
  filename: string
  contentType: string
  sizeBytes: number
  fetchBlob: () => Promise<Blob>
  onOpenChange: (open: boolean) => void
}) {
  const [isDownloading, setIsDownloading] = useState(false)

  const onDownload = async () => {
    setIsDownloading(true)
    try {
      downloadBlob(await fetchBlob(), filename)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{filename}</DialogTitle>
          <DialogDescription>{formatBytes(sizeBytes)}</DialogDescription>
        </DialogHeader>

        <AuthMedia
          queryKey={['attachment-lightbox', filename]}
          fetchBlob={fetchBlob}
          contentType={contentType}
          alt={filename}
          controls
          className="max-h-[60vh] w-full bg-black"
        />

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