'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { Download, ImageOff, Loader2, Paperclip, Share, X } from 'lucide-react'
import { toast } from 'sonner'

import { messagingApi } from '@/lib/api/messaging.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { cn } from '@/lib/utils/cn'
import { isStandalone, shareOrDownload } from '@/lib/utils/pwa'
import { useAttachmentBlob } from '@/lib/messaging/use-attachment-blob'
import type { Attachment } from '@/types/messaging'

/**
 * Pièces jointes d'un message de conversation (admin ET parent) : photos et
 * vidéos (`image/*`, `video/*`) s'affichent en aperçu intégré (lecteur pour
 * la vidéo), les autres fichiers restent un bouton de téléchargement.
 * Chaque aperçu garde son bouton de téléchargement.
 */
export function MessageAttachments({
  attachments,
  highlight,
  onRemove,
  removingId,
}: {
  attachments: Attachment[]
  /** true quand la bulle du message est en couleur (message de l'utilisateur). */
  highlight: boolean
  /** Défini = l'auteur peut retirer ses médias (croix sur chaque pièce jointe). */
  onRemove?: (attachmentId: string) => void
  removingId?: string | null
}) {
  const t = useTranslations('messaging')
  return (
    <>
      {attachments.map((att) => (
        <span key={att.id} className={cn(onRemove && 'relative block')}>
          {att.content_type.startsWith('video/') || att.content_type.startsWith('image/') ? (
            <MediaPreview attachment={att} />
          ) : (
            <FileDownloadButton attachment={att} highlight={highlight} />
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              disabled={removingId === att.id}
              aria-label={`Retirer ${att.filename}`}
              title={t('media.removeAttachment')}
              className="absolute left-1 top-2.5 rounded-full bg-black/60 p-1 text-white transition hover:bg-destructive disabled:opacity-60"
            >
              {removingId === att.id
                ? <Loader2 className="size-3.5 animate-spin" />
                : <X className="size-3.5" />}
            </button>
          )}
        </span>
      ))}
    </>
  )
}

export function FileDownloadButton({
  attachment: att,
  highlight,
}: {
  attachment: Attachment
  highlight: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'mt-1.5 flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-xs underline-offset-2 hover:underline',
        highlight ? 'border-primary-foreground/30' : 'border-border'
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
      <Paperclip className="size-3 shrink-0" />
      <span className="min-w-0 truncate">{att.filename}</span>
    </button>
  )
}

/**
 * Photos et vidéos : aperçu seul, SANS nom de fichier. Un tap/clic sur
 * l'aperçu enregistre le média — feuille de partage native (galerie photo)
 * en PWA installée, téléchargement classique sur le web.
 *
 * Téléchargement paresseux (lorsque visible à l'écran) + blob partagé en
 * cache : un fil avec 20 photos ne lance plus 20 GET parallèles, et une
 * erreur réseau affiche un état local au lieu d'un toast par média.
 */
function MediaPreview({
  attachment: att,
}: {
  attachment: Attachment
}) {
  const t = useTranslations('messaging')
  const [isPwa, setIsPwa] = useState(false)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const isVideo = att.content_type.startsWith('video/')

  useEffect(() => {
    setIsPwa(isStandalone())
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { blob, url, isLoading, isError } = useAttachmentBlob(visible ? att.id : null)

  const save = async () => {
    if (!blob) return
    try {
      await shareOrDownload(blob, att.filename, att.content_type)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }
  const hint = isPwa ? t('media.saveToGallery') : t('media.download')

  return (
    <span ref={ref} className="mt-1.5 block max-w-full">
      {!visible || isLoading ? (
        <span className="flex h-16 items-center text-xs opacity-70">
          {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Chargement de l&apos;aperçu…
        </span>
      ) : isError || !url ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" />
          Aperçu indisponible
        </span>
      ) : isVideo ? (
        <span className="relative block">
          <video src={url} controls preload="metadata" className="max-h-64 w-full rounded" />
            <button
              type="button"
              onClick={save}
              title={hint}
              aria-label={hint}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              {isPwa ? <Share className="size-3.5" /> : <Download className="size-3.5" />}
            </button>
        </span>
      ) : (
          <button
            type="button"
            onClick={save}
            title={hint}
            aria-label={`${hint} — ${att.filename}`}
            className="block max-w-full cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-h-64 w-auto max-w-full rounded" />
          </button>
      )}
    </span>
  )
}
