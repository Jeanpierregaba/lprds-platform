'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, FileText, Loader2, Share2, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { messagingApi } from '@/lib/api/messaging.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { formatBytes } from '@/lib/utils/locale-format'
import { canShareFilesHere, shareFile } from '@/lib/utils/pwa'
import { useAttachmentBlob } from '@/lib/messaging/use-attachment-blob'
import { cn } from '@/lib/utils/cn'
import type { Attachment } from '@/types/messaging'

const isPdf = (att: Attachment) => att.content_type === 'application/pdf'

/** Étiquette courte du format : « PDF », « DOCX »… Ce ne sont pas des mots
 *  d'interface mais des noms de formats, identiques dans les deux langues. */
function formatLabel(att: Attachment): string | null {
  if (isPdf(att)) return 'PDF'
  const ext = att.filename.split('.').pop()
  return ext && ext.length <= 5 && ext !== att.filename ? ext.toUpperCase() : null
}

/**
 * Un fichier joint — en pratique un PDF — dans une diffusion ou une
 * conversation.
 *
 * ⚠️ C'était un simple bouton-trombone au texte souligné : rien n'y disait
 * qu'on avait affaire à un document, ni son poids, et il n'offrait qu'UN
 * geste, le téléchargement. Or c'est précisément celui qui a échoué chez un
 * parent (cf. `lib/utils/download.ts`). Un document se LIT ; proposer de
 * l'ouvrir d'abord, c'est à la fois plus direct et le seul chemin qui reste
 * quand le système refuse d'enregistrer.
 *
 * « Partager » n'apparaît que sur un appareil tactile capable de partager des
 * fichiers : c'est là qu'il sert, et il y mène à « Enregistrer dans
 * Fichiers » quand le téléchargement, lui, ne mène nulle part.
 */
export function FileAttachmentCard({
  attachment: att,
  highlight,
  onRemove,
  removing = false,
}: {
  attachment: Attachment
  /** true quand la bulle du message est en couleur (message de l'utilisateur). */
  highlight: boolean
  /** Défini = l'auteur peut retirer ce fichier de son message. */
  onRemove?: () => void
  removing?: boolean
}) {
  const t = useTranslations('messaging')
  const tCommon = useTranslations('common')
  const [busy, setBusy] = useState<'save' | 'share' | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const canShare = canShareFilesHere(att.content_type)
  const label = formatLabel(att)

  const fetchBlob = async () => (await messagingApi.downloadAttachment(att.id)).data

  const onSave = async () => {
    setBusy('save')
    try {
      downloadBlob(await fetchBlob(), att.filename)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const onShare = async () => {
    setBusy('share')
    try {
      const ok = await shareFile(await fetchBlob(), att.filename, att.content_type)
      if (!ok) toast.error(t('file.shareFailed'))
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div
        className={cn(
          'mt-1.5 max-w-full rounded-xl border p-2.5',
          highlight ? 'border-primary-foreground/30 bg-black/10' : 'border-border bg-muted/40',
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              highlight ? 'bg-primary-foreground/20' : 'bg-destructive/10 text-destructive',
            )}
          >
            <FileText className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={att.filename}>{att.filename}</p>
            <p className={cn('text-xs', highlight ? 'opacity-80' : 'text-muted-foreground')}>
              {label ? `${label} · ` : ''}{formatBytes(att.size_bytes)}
            </p>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={removing}
              aria-label={tCommon('actions.removeNamed', { name: att.filename })}
              title={t('media.removeAttachment')}
              className="shrink-0 rounded-full p-1 opacity-70 transition hover:bg-destructive hover:text-destructive-foreground hover:opacity-100 disabled:opacity-40"
            >
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {isPdf(att) && (
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg bg-background text-foreground" onClick={() => setViewerOpen(true)}>
              {t('file.open')}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg bg-background text-foreground" onClick={onSave} disabled={busy !== null}>
            {busy === 'save'
              ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              : <Download className="mr-1.5 size-3.5" />}
            {tCommon('actions.save')}
          </Button>
          {canShare && (
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg bg-background text-foreground" onClick={onShare} disabled={busy !== null}>
              {busy === 'share'
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <Share2 className="mr-1.5 size-3.5" />}
              {t('file.share')}
            </Button>
          )}
        </div>
      </div>

      {viewerOpen && (
        <PdfViewer
          attachment={att}
          onClose={() => setViewerOpen(false)}
          onSave={onSave}
          onShare={canShare ? onShare : undefined}
          busy={busy !== null}
        />
      )}
    </>
  )
}

/**
 * Lecture d'un PDF sans quitter la messagerie.
 *
 * ⚠️ **Tous les navigateurs n'affichent pas un PDF dans un cadre** — Chrome
 * sur Android, notamment, ne le fait pas. Les boutons « Enregistrer » et
 * « Partager » sont donc répétés ICI, sous le cadre : si rien ne s'affiche,
 * la sortie est sous les yeux plutôt qu'à refermer le dialogue pour la
 * chercher.
 */
function PdfViewer({
  attachment: att, onClose, onSave, onShare, busy,
}: {
  attachment: Attachment
  onClose: () => void
  onSave: () => void
  onShare?: () => void
  busy: boolean
}) {
  const t = useTranslations('messaging')
  const tCommon = useTranslations('common')
  const { url, isLoading, isError } = useAttachmentBlob(att.id)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92dvh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-words" title={att.filename}>{att.filename}</DialogTitle>
          <DialogDescription>{formatBytes(att.size_bytes)}</DialogDescription>
        </DialogHeader>

        <div className="flex h-[65dvh] items-center justify-center overflow-hidden rounded-md border border-border bg-background">
          {isLoading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('file.loading')}
            </span>
          ) : isError || !url ? (
            <p className="px-6 text-center text-sm text-muted-foreground">{t('file.loadFailed')}</p>
          ) : (
            /* ⚠️ `<object>` et non `<iframe>` : il rend SES ENFANTS quand le
               navigateur ne sait pas afficher le type. Avec un cadre, un
               navigateur sans lecteur PDF — Chrome sur Android, et la vue
               intégrée où ceci a été vérifié — laisse un rectangle vide et
               sombre, que l'on lit comme une panne. Ici, le repli dit ce qui
               se passe et le geste utile reste juste en dessous. */
            <object data={url} type={att.content_type} className="size-full">
              <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center">
                <FileText className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('file.inlineUnsupported')}</p>
              </div>
            </object>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t('file.viewerHint')}</p>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onSave} disabled={busy}>
            <Download className="mr-1.5 size-4" />
            {tCommon('actions.save')}
          </Button>
          {onShare && (
            <Button type="button" variant="outline" onClick={onShare} disabled={busy}>
              <Share2 className="mr-1.5 size-4" />
              {t('file.share')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
