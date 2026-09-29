'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { Loader2, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageAttachments } from './message-attachments'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { cn } from '@/lib/utils/cn'
import type { Message } from '@/types/messaging'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({
  message: msg,
  isMine,
  editable,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editPending,
  onDelete,
  deletePending,
  onRemoveAttachment,
  removingAttachmentId,
}: {
  message: Message
  isMine: boolean
  /** Bouton Modifier visible (fenêtre de 15 min, gérée par l'appelant). */
  editable: boolean
  editing: boolean
  draft: string
  onDraftChange: (value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  editPending: boolean
  onDelete: () => void
  deletePending: boolean
  onRemoveAttachment: (attachmentId: string) => void
  removingAttachmentId: string | null
}) {
  const t = useTranslations('messaging')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (msg.is_deleted) {
    return (
      <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
        <div className="max-w-[75%] rounded-lg bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">
          {t('bubble.deleted')}
        </div>
        <div className="mt-0.5 px-1 text-xs text-muted-foreground">
          <span>{formatTime(msg.created_at)}</span>
        </div>
      </div>
    )
  }

  const showMenu = isMine && !editing && !deletePending

  return (
    <div className={cn('group flex flex-col', isMine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-lg px-3 py-2 text-sm',
          isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              rows={2}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSaveEdit()
                }
                if (e.key === 'Escape') onCancelEdit()
              }}
              className="min-w-0 w-full resize-none bg-background text-foreground"
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit} disabled={editPending}>
                {t('bubble.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onSaveEdit}
                disabled={editPending || (!draft.trim() && msg.attachments.length === 0)}
              >
                {editPending ? <Loader2 className="size-3.5 animate-spin" /> : t('bubble.save')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {msg.body ? <p className="whitespace-pre-wrap">{msg.body}</p> : null}
            <MessageAttachments
              attachments={msg.attachments}
              highlight={isMine}
              onRemove={isMine && msg.attachments.length > 0 ? onRemoveAttachment : undefined}
              removingId={removingAttachmentId}
            />
          </>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <span>{formatTime(msg.created_at)}</span>
        {msg.edited_at && <span>{t('bubble.edited')}</span>}
        {isMine && msg.read_at && <span>· Vu</span>}
        {showMenu && (
          // Visible au survol, au focus clavier, et toujours sur tactile
          // (pas de hover) — sinon édition/suppression inaccessibles sur mobile.
          <span className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
            {editable && (
              <button
                type="button"
                onClick={onStartEdit}
                aria-label={t('bubble.editAria')}
                title={t('bubble.editTitle')}
                className="rounded p-2 transition hover:bg-muted-foreground/20"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={editing}
              aria-label={t('bubble.deleteAria')}
              title={t('bubble.deleteTitle')}
              className="rounded p-2 transition hover:bg-muted-foreground/20 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        )}
        {deletePending && <Loader2 className="size-3.5 animate-spin" />}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('bubble.deleteConfirmTitle')}
        description={t('bubble.deleteConfirmBody')}
        confirmLabel={t('bubble.delete')}
        destructive
        onConfirm={() => {
          setConfirmDelete(false)
          onDelete()
        }}
      />
    </div>
  )
}
