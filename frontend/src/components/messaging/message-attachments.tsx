'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, Paperclip, Share, X } from 'lucide-react'
import { toast } from 'sonner'

import { messagingApi } from '@/lib/api/messaging.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { cn } from '@/lib/utils/cn'
import { isStandalone, shareOrDownload } from '@/lib/utils/pwa'
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
              title="Retirer cette pièce jointe"
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
 */
function MediaPreview({
  attachment: att,
}: {
  attachment: Attachment
}) {
  const [media, setMedia] = useState<{ url: string; blob: Blob } | null>(null)
  const [isPwa, setIsPwa] = useState(false)
  const isVideo = att.content_type.startsWith('video/')

  useEffect(() => {
    setIsPwa(isStandalone())
    let alive = true
    let url: string | null = null
    messagingApi
      .downloadAttachment(att.id)
      .then((res) => {
        if (!alive) return
        url = URL.createObjectURL(res.data)
        setMedia({ url, blob: res.data })
      })
      .catch((err) => {
        if (alive) toast.error(getApiErrorMessage(err))
      })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [att.id])

  const save = async () => {
    if (!media) return
    try {
      await shareOrDownload(media.blob, att.filename, att.content_type)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }
  const hint = isPwa ? 'Enregistrer dans la galerie' : 'Télécharger'

  return (
    <span className="mt-1.5 block max-w-full">
      {media ? (
        isVideo ? (
          <span className="relative block">
            <video src={media.url} controls preload="metadata" className="max-h-64 w-full rounded" />
            <button
              type="button"
              onClick={save}
              title={hint}
              aria-label={hint}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
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
            className="block cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.url} alt="" className="max-h-64 w-auto rounded" />
          </button>
        )
      ) : (
        <span className="text-xs opacity-70">Chargement de l&apos;aperçu…</span>
      )}
    </span>
  )
}
