'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { passwordField } from '@/lib/validation/password'

/** Confirmation destructive (M14-b). Le déclencheur reste côté page. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, destructive = false,
  confirmDisabled = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
  confirmDisabled?: boolean
}) {
  const tCommon = useTranslations('common')
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Badge QR imprimable enfant / staff (M14-c). */
export function QrBadgeDialog({
  open, onOpenChange, title, subtitle, qrImage, loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle: string
  qrImage: string | undefined
  loading: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{subtitle}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          {loading || !qrImage ? (
            <Skeleton className="size-48 rounded-xl" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} alt={`QR ${subtitle}`} className="size-48 rounded-xl ring-1 ring-border" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Relance d'invitation — avertissement, et mot de passe FACULTATIF.
 *
 * Partagé par les écrans parents et personnel : le geste, sa politique et son
 * avertissement sont identiques des deux côtés, et deux copies finiraient par
 * dire deux choses différentes du même risque.
 *
 * ⚠️ Ce n'était qu'une confirmation ; c'est devenu un petit formulaire, pour
 * une raison de fond : le mot de passe que la plateforme GÉNÈRE, personne ne
 * peut le relire — il n'existe que dans l'email parti, et le retourner dans
 * une réponse HTTP est ce que le backend refuse. Un admin qui doit transmettre
 * les accès par un autre canal (l'email n'arrive pas, la boîte est abandonnée)
 * doit donc choisir le mot de passe lui-même. Laissé vide, le comportement
 * d'origine est intact.
 *
 * ⚠️ Un champ de saisie **ne peut pas** vivre dans un `ConfirmDialog` : sa
 * description est un `<p>`, et y glisser un `<div>`/`<input>` produit du HTML
 * invalide que React signale à l'hydratation. D'où un vrai `Dialog`.
 */
export function ResendInvitationDialog({
  open, onOpenChange, title, confirmLabel, warning, pending, onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre et bouton viennent du MODULE appelant : « Relancer l'invitation »
   *  y est déjà traduit, et une seconde copie dans `common` finirait par dire
   *  autre chose. */
  title: string
  confirmLabel: string
  /** Texte qui DÉPEND de `last_login_at` — relancer un compte déjà utilisé lui
   *  retire le mot de passe qu'il s'est choisi. */
  warning: string
  pending: boolean
  onConfirm: (password?: string) => void
}) {
  const tCommon = useTranslations('common')
  const tAuth = useTranslations('auth')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)

  // Le mot de passe ne survit pas à la fermeture : ni dans l'état, ni ailleurs.
  useEffect(() => {
    if (!open) { setPassword(''); setShown(false) }
  }, [open])

  const erreur =
    password === ''
      ? null
      : passwordField(tAuth).safeParse(password).error?.issues[0]?.message ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{warning}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="resend_password">{tCommon('credentials.optionalPassword')}</Label>
          <div className="flex gap-2">
            <Input
              id="resend_password"
              type={shown ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!erreur}
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShown((v) => !v)}
                    aria-label={tCommon(shown ? 'credentials.hidePassword' : 'credentials.showPassword')}>
              {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          {erreur
            ? <p className="text-sm text-destructive">{erreur}</p>
            : <p className="text-xs text-muted-foreground">{tCommon('credentials.optionalPasswordHint')}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !!erreur}
            onClick={() => onConfirm(password || undefined)}
          >
            {pending
              ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> {tCommon('states.sending')}</>
              : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
