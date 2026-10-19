'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImagePlus, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ACCEPT_PHOTO, isObviouslyNotAnImage } from '@/lib/utils/uploads'
import { BookCover } from './book-cover'

/**
 * Ce que l'utilisateur a décidé de la couverture, appliqué à l'enregistrement.
 *
 * ⚠️ RIEN n'est envoyé au moment du choix, et c'est une décision : dans un
 * formulaire, « Annuler » doit tout annuler. Téléverser dès la sélection
 * laisserait la nouvelle couverture en place après un Annuler — et un livre
 * NEUF n'a de toute façon pas encore d'identifiant où la déposer.
 */
export type CoverIntent =
  | { kind: 'keep' }
  | { kind: 'replace'; file: File }
  | { kind: 'remove' }

export function BookCoverPicker({
  bookId, title, hasCover, intent, onIntentChange,
}: {
  bookId: string | null
  title: string
  hasCover: boolean
  intent: CoverIntent
  onIntentChange: (intent: CoverIntent) => void
}) {
  const t = useTranslations('library')
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  // L'aperçu local vit aussi longtemps que le fichier choisi, pas plus : une
  // URL d'objet jamais révoquée garde le fichier en mémoire pour la session.
  useEffect(() => {
    if (intent.kind !== 'replace') {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(intent.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [intent])

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // On ne refuse que l'explicitement mauvais — le doute part au serveur, qui
    // seul lit les octets (cf. `app/core/media.py`).
    if (isObviouslyNotAnImage(file)) {
      toast.error(t('cover.mustBeImage'))
      return
    }
    onIntentChange({ kind: 'replace', file })
  }

  // Une couverture retirée ne se montre plus, même si le serveur l'a encore :
  // l'écran doit refléter ce qui sera enregistré.
  const showsCover = intent.kind === 'remove' ? false : hasCover

  return (
    <div className="flex items-start gap-4">
      <BookCover
        bookId={bookId ?? ''}
        title={title}
        hasCover={Boolean(bookId) && showsCover}
        previewUrl={preview}
        size="lg"
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept={ACCEPT_PHOTO} className="hidden" onChange={pick} />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <ImagePlus className="mr-1.5 size-4" />
            {showsCover || preview ? t('cover.replace') : t('cover.add')}
          </Button>

          {/* Revenir en arrière sur un choix non encore envoyé — distinct de
              « retirer », qui supprime une couverture déjà enregistrée. */}
          {intent.kind !== 'keep' && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onIntentChange({ kind: 'keep' })}>
              <Undo2 className="mr-1.5 size-4" />
              {t('cover.undo')}
            </Button>
          )}

          {intent.kind !== 'remove' && hasCover && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onIntentChange({ kind: 'remove' })}>
              <X className="mr-1.5 size-4" />
              {t('cover.remove')}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {intent.kind === 'remove' ? t('cover.pendingRemoval') : t('cover.hint')}
        </p>
      </div>
    </div>
  )
}
