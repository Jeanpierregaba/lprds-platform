'use client'

import type { ReactNode } from 'react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
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
