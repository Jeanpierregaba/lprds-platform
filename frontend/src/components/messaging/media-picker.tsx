'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

/** Nombre max de médias joints à une diffusion (miroir du backend
 *  `MAX_ANNOUNCEMENT_ATTACHMENTS` — le serveur rejette en 409 au-delà). */
export const MAX_ANNOUNCEMENT_MEDIA = 15

const ACCEPT = 'image/*,video/*,application/pdf'

function isAllowedMedia(file: File): boolean {
  if (file.type === 'image/svg+xml') return false
  return (
    file.type.startsWith('image/') ||
    file.type.startsWith('video/') ||
    file.type === 'application/pdf'
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
 * Utilisé aussi par les conversations privées (photos/vidéos, sans PDF) via
 * `max` et le filtrage des types rejetés côté appelant.
 */
export function MediaPicker({
  files,
  onChange,
  max = MAX_ANNOUNCEMENT_MEDIA,
  disabled = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  disabled?: boolean
}) {
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
    const rejected = incoming.filter((file) => !isAllowedMedia(file))
    if (rejected.length > 0) {
      toast.error(
        `Fichier(s) ignoré(s) — seules les photos, vidéos et PDF sont acceptés : ${rejected.map((f) => f.name).join(', ')}`
      )
    }
    const allowed = incoming.filter((file) => isAllowedMedia(file))
    const room = max - files.length
    if (allowed.length > room) {
      toast.error(`Limite de ${max} médias par envoi — ${allowed.length - room} fichier(s) ignoré(s).`)
    }
    const kept = allowed.slice(0, Math.max(room, 0))
    if (kept.length > 0) onChange([...files, ...kept])
  }

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {files.length}/{max} média{files.length > 1 ? 's' : ''}
        </p>
        {files.length < max && (
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Plus className="mr-1.5 size-3.5" />
            Ajouter
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
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-destructive"
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
        accept={ACCEPT}
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
