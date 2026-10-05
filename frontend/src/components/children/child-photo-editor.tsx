'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { ChildAvatar } from '@/components/children/child-avatar'
import { childrenApi } from '@/lib/api/children.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { ACCEPT_PHOTO, isObviouslyNotAnImage } from '@/lib/utils/uploads'

/**
 * Photo de profil : la poser, la remplacer, la retirer.
 *
 * Les trois acteurs autorisés passent par CE composant — l'admin depuis la
 * fiche, le parent depuis son portail, l'éducatrice depuis son groupe. Le
 * backend tranche le droit (cf. `_child_for_photo`) ; l'écran se contente de
 * ne pas proposer un bouton voué à un 403.
 *
 * ⚠️ Pas de pré-filtrage sur `file.type` : un fichier venu d'un gestionnaire
 * de fichiers ou re-partagé depuis une messagerie arrive souvent sans type.
 * On ne refuse que l'explicitement mauvais, le doute part au serveur, qui seul
 * lit les octets.
 */
/** Dépôt et retrait de la photo — partagés par l'éditeur complet (fiche) et
 *  le bouton compact (carte du portail parent). */
function useChildPhoto(childId: string, onChanged?: () => void) {
  const t = useTranslations('children')
  const queryClient = useQueryClient()

  const refresh = () => {
    // La vignette est en cache « pour toujours » : sans cette invalidation,
    // l'ancienne photo resterait affichée après le remplacement.
    queryClient.invalidateQueries({ queryKey: ['children', 'photo-thumb', childId] })
    onChanged?.()
  }

  const upload = useMutation({
    mutationFn: (file: File) => childrenApi.setPhoto(childId, file),
    onSuccess: () => { toast.success(t('photo.saved')); refresh() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: () => childrenApi.removePhoto(childId),
    onSuccess: () => { toast.success(t('photo.removed')); refresh() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  /** Le fichier choisi part au serveur, sauf s'il n'est explicitement pas une
   *  image — le doute, lui, part au serveur, qui seul lit les octets. */
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (isObviouslyNotAnImage(file)) {
      toast.error(t('photo.mustBeImage'))
      return
    }
    upload.mutate(file)
  }

  return { upload, remove, pick, busy: upload.isPending || remove.isPending }
}

/** Bouton seul, pour les écrans où l'avatar vit déjà dans une carte cliquable. */
export function ChildPhotoButton({
  childId, hasPhoto, onChanged, className,
}: {
  childId: string
  hasPhoto: boolean
  onChanged?: () => void
  className?: string
}) {
  const t = useTranslations('children')
  const input = useRef<HTMLInputElement>(null)
  const { pick, upload, busy } = useChildPhoto(childId, onChanged)

  return (
    <>
      <input ref={input} type="file" accept={ACCEPT_PHOTO} className="hidden" onChange={pick} />
      <button
        type="button"
        disabled={busy}
        title={hasPhoto ? t('photo.replace') : t('photo.add')}
        aria-label={hasPhoto ? t('photo.replace') : t('photo.add')}
        onClick={() => input.current?.click()}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-full',
          'bg-card text-muted-foreground shadow-soft ring-1 ring-border',
          'transition hover:text-foreground disabled:opacity-60',
          className,
        )}
      >
        {upload.isPending
          ? <Loader2 className="size-4 animate-spin" />
          : <Camera className="size-4" />}
      </button>
    </>
  )
}

export function ChildPhotoEditor({
  childId, firstNames, lastName, hasPhoto, canEdit, onChanged, size = 'xl',
}: {
  childId: string
  firstNames: string
  lastName: string
  hasPhoto: boolean
  canEdit: boolean
  onChanged?: () => void
  size?: 'lg' | 'xl'
}) {
  const t = useTranslations('children')
  const input = useRef<HTMLInputElement>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { upload, remove, pick, busy } = useChildPhoto(childId, () => {
    setConfirmRemove(false)
    onChanged?.()
  })

  return (
    <div className="flex items-center gap-4">
      <ChildAvatar
        childId={childId}
        firstNames={firstNames}
        lastName={lastName}
        hasPhoto={hasPhoto}
        size={size}
      />

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT_PHOTO}
            className="hidden"
            onChange={pick}
          />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {upload.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Camera className="mr-1.5 size-4" />}
            {hasPhoto ? t('photo.replace') : t('photo.add')}
          </Button>
          {/* "outline" et non "ghost" : ces boutons sont posés sur l'image de
              fond du tableau de bord, où un fantôme ne se lit pas. */}
          {hasPhoto && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => (confirmRemove ? remove.mutate() : setConfirmRemove(true))}
            >
              <Trash2 className="mr-1.5 size-4" />
              {confirmRemove ? t('photo.confirmRemove') : t('photo.remove')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
