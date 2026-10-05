'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/utils/locale-format'

/** Nombre max de médias joints à une diffusion (miroir du backend
 *  `MAX_ANNOUNCEMENT_ATTACHMENTS` — le serveur rejette en 409 au-delà). */
export const MAX_ANNOUNCEMENT_MEDIA = 15

/** Plafond vidéo, miroir du backend (`MESSAGING_MAX_VIDEO_MB`).
 *
 * ⚠️ Il n'y a plus de plafond IMAGE côté client : le serveur recompresse une
 * photo trop lourde au lieu de la refuser, donc l'arrêter ici reviendrait à
 * rejeter ce qui serait passé. La vidéo, elle, n'est pas transcodée — mieux
 * vaut l'arrêter avant d'avoir téléversé 200 Mo sur une connexion mobile. */
export const MAX_VIDEO_MB = 50

/* `accept` liste aussi des EXTENSIONS : sur plusieurs plateformes un `.heic`
   n'a pas de type MIME connu du navigateur, et `image/*` seul le rend
   ingrisable dans le sélecteur de fichiers. */
const EXTRA_EXT = '.heic,.heif,.avif,.mov,.3gp,.mkv'
const ACCEPT_ALL = `image/*,video/*,application/pdf,${EXTRA_EXT}`
const ACCEPT_NO_PDF = `image/*,video/*,${EXTRA_EXT}`

/**
 * ⚠️ On ne refuse que ce dont on est SÛR.
 *
 * Le filtre testait `file.type.startsWith('image/')`, c'est-à-dire le MIME que
 * le navigateur a bien voulu deviner. Un `.heic` d'iPhone, un fichier venu
 * d'un gestionnaire de fichiers ou re-partagé depuis une messagerie arrive
 * souvent avec un type VIDE : la photo était refusée avant même d'être
 * envoyée, et la même photo passait depuis un autre appareil. C'est le
 * « certains formats passent, d'autres non » remonté par l'établissement.
 *
 * Le serveur lit désormais les octets : lui seul sait. En cas de doute, on
 * laisse donc partir — un aller-retour vaut mieux qu'un refus injustifié.
 */
function isObviouslyRejected(file: File, allowPdf: boolean): boolean {
  if (file.type === 'image/svg+xml') return true
  if (!file.type) return false
  return !(
    file.type.startsWith('image/') ||
    file.type.startsWith('video/') ||
    (allowPdf && file.type === 'application/pdf')
  )
}

function isVideo(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|3gp|mkv|avi|webm)$/i.test(file.name)
}

/**
 * Sélection multiple de médias avec prévisualisation avant envoi : miniatures
 * pour les photos, lecteur intégré pour les vidéos, fiche fichier pour les PDF.
 * Le parent garde la main sur l'envoi (création de diffusion ou carte existante).
 * `allowPdf=false` pour les conversations privées (photos/vidéos uniquement).
 */
export function MediaPicker({
  files,
  onChange,
  max = MAX_ANNOUNCEMENT_MEDIA,
  disabled = false,
  allowPdf = true,
}: {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  disabled?: boolean
  allowPdf?: boolean
}) {
  const t = useTranslations('messaging')
  const tCommon = useTranslations('common')
  const inputRef = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const created = files.map((file) => URL.createObjectURL(file))
    setUrls(created)
    return () => created.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    const rejected = incoming.filter((file) => isObviouslyRejected(file, allowPdf))
    if (rejected.length > 0) {
      toast.error(
        `${allowPdf ? t('media.rejectedWithPdf') : t('media.rejectedNoPdf')} ${rejected.map((f) => f.name).join(', ')}`
      )
    }
    const allowed = incoming.filter((file) => !isObviouslyRejected(file, allowPdf))
    // Seule la vidéo est arrêtée ici : une image trop lourde sera allégée par
    // le serveur, la refuser maintenant serait un faux refus.
    const tooBig = allowed.filter(
      (file) => isVideo(file) && file.size > MAX_VIDEO_MB * 1024 * 1024,
    )
    if (tooBig.length > 0) {
      toast.error(t('media.videoTooBig', {
        max: MAX_VIDEO_MB, names: tooBig.map((f) => f.name).join(', '),
      }))
    }
    const fitting = allowed.filter((file) => !tooBig.includes(file))
    const room = max - files.length
    if (fitting.length > room) {
      toast.error(t('media.tooMany', { max, ignored: fitting.length - room }))
    }
    const kept = fitting.slice(0, Math.max(room, 0))
    if (kept.length > 0) onChange([...files, ...kept])
  }

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('media.count', { count: files.length, max })}
        </p>
        {files.length < max && (
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Plus className="mr-1.5 size-3.5" />
            {tCommon('actions.add')}
          </Button>
        )}
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${file.size}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border"
            >
              {file.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[i]} alt={file.name} className="size-full object-cover" />
              ) : file.type.startsWith('video/') ? (
                <video src={urls[i]} className="size-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center">
                  <FileText className="size-6 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={tCommon('actions.removeNamed', { name: file.name })}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-2 text-white transition hover:bg-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={allowPdf ? ACCEPT_ALL : ACCEPT_NO_PDF}
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </fieldset>
  )
}
