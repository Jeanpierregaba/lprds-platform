'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { Download, ImageOff, Loader2, Share, X } from 'lucide-react'
import { toast } from 'sonner'

import { messagingApi } from '@/lib/api/messaging.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { isStandalone, shareOrDownload } from '@/lib/utils/pwa'
import { useAttachmentBlob } from '@/lib/messaging/use-attachment-blob'
import { FileAttachmentCard } from './file-attachment-card'
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
  const tCommon = useTranslations('common')
  return (
    <>
      {attachments.map((att) => {
        const isMedia =
          att.content_type.startsWith('video/') || att.content_type.startsWith('image/')
        // ⚠️ La croix de retrait est posée en ABSOLU sur l'aperçu d'un média,
        // qui n'a ni cadre ni marge où la loger. Une carte de fichier, elle,
        // en a une : la croix y entre, sinon elle recouvre l'icône du
        // document — vu à l'écran.
        if (!isMedia) {
          return (
            <FileAttachmentCard
              key={att.id}
              attachment={att}
              highlight={highlight}
              onRemove={onRemove ? () => onRemove(att.id) : undefined}
              removing={removingId === att.id}
            />
          )
        }
        return (
          <span key={att.id} className={cn(onRemove && 'relative block')}>
            <MediaPreview attachment={att} />
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                disabled={removingId === att.id}
                aria-label={tCommon('actions.removeNamed', { name: att.filename })}
                title={t('media.removeAttachment')}
                className="absolute left-1 top-2.5 rounded-full bg-black/60 p-1 text-white transition hover:bg-destructive disabled:opacity-60"
              >
                {removingId === att.id
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <X className="size-3.5" />}
              </button>
            )}
          </span>
        )
      })}
    </>
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

  // Aperçu en vignette : la bulle fait quelques dizaines de pixels.
  const { url, isLoading, isError } = useAttachmentBlob(visible ? att.id : null, { thumb: true })

  const save = async () => {
    try {
      // ⚠️ L'ORIGINAL, pas la vignette affichée au-dessus : on enregistre la
      // photo que l'établissement a envoyée, pas sa miniature.
      const res = await messagingApi.downloadAttachment(att.id)
      await shareOrDownload(res.data, att.filename, att.content_type)
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
          {t('media.loadingPreview')}
        </span>
      ) : isError || !url ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" />
          {t('previewUnavailable')}
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
