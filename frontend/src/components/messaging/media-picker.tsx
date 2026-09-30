'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

/** Nombre max de médias joints à une diffusion (miroir du backend
 *  `MAX_ANNOUNCEMENT_ATTACHMENTS` — le serveur rejette en 409 au-delà). */
export const MAX_ANNOUNCEMENT_MEDIA = 15

/** Plafonds miroirs du backend (`config.py`) — pré-vérification côté client
 * pour éviter un rejet 413 après envoi. */
export const MAX_FILE_MB = 10
export const MAX_VIDEO_MB = 50

const ACCEPT_ALL = 'image/*,video/*,application/pdf'
const ACCEPT_NO_PDF = 'image/*,video/*'

function maxBytesFor(file: File): number {
  return (file.type.startsWith('video/') ? MAX_VIDEO_MB : MAX_FILE_MB) * 1024 * 1024
}

function isAllowedMedia(file: File, allowPdf: boolean): boolean {
  if (file.type === 'image/svg+xml') return false
  return (
    file.type.startsWith('image/') ||
    file.type.startsWith('video/') ||
    (allowPdf && file.type === 'application/pdf')
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
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
    const rejected = incoming.filter((file) => !isAllowedMedia(file, allowPdf))
    if (rejected.length > 0) {
      toast.error(
        `${allowPdf ? t('media.rejectedWithPdf') : t('media.rejectedNoPdf')} ${rejected.map((f) => f.name).join(', ')}`
      )
    }
    const allowed = incoming.filter((file) => isAllowedMedia(file, allowPdf))
    const tooBig = allowed.filter((file) => file.size > maxBytesFor(file))
    if (tooBig.length > 0) {
      toast.error(
        `Fichier(s) trop volumineux (max ${MAX_FILE_MB} Mo, ${MAX_VIDEO_MB} Mo pour les vidéos) : ${tooBig.map((f) => f.name).join(', ')}`
      )
    }
    const fitting = allowed.filter((file) => file.size <= maxBytesFor(file))
    const room = max - files.length
    if (fitting.length > room) {
      toast.error(`Limite de ${max} médias par envoi — ${fitting.length - room} fichier(s) ignoré(s).`)
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
                  <span className="text-[11px] text-muted-foreground">{formatSize(file.size)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Retirer ${file.name}`}
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
