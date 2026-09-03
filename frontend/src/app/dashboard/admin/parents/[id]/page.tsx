'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { parentsApi } from '@/lib/api/parents.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { ChildMultiSelect } from '../child-multiselect'
import type { ParentChildBrief } from '@/types/parents'

const infoSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(100),
  last_name:  z.string().min(1, 'Nom requis').max(100),
  nickname:   z.string().min(1, 'Surnom requis').max(100),
  phone:      z.string().min(1, 'Téléphone requis').max(20),
  email:      z.string().email('Email invalide'),
})
type InfoForm = z.infer<typeof infoSchema>

const resetSchema = z.object({
  new_password: z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type ResetForm = z.infer<typeof resetSchema>

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export default function ParentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)
  const [children, setChildren] = useState<ParentChildBrief[]>([])
  const [childrenError, setChildrenError] = useState<string | null>(null)

  const { data: parent, isLoading } = useQuery({
    queryKey: ['parents', id],
    queryFn: () => parentsApi.get(id).then((r) => r.data),
  })

  useEffect(() => {
    if (parent) setChildren(parent.assigned_children)
  }, [parent?.id])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['parents', id] })

  const {
    register: registerInfo,
    handleSubmit: handleInfoSubmit,
    formState: { errors: infoErrors, isSubmitting: isSavingInfo },
    reset: resetInfoForm,
  } = useForm<InfoForm>({
    resolver: zodResolver(infoSchema),
    values: parent
      ? {
          first_name: parent.first_name, last_name: parent.last_name, nickname: parent.nickname ?? '',
          phone: parent.phone ?? '', email: parent.email,
        }
      : undefined,
  })

  const onSaveInfo = async (values: InfoForm) => {
    if (children.length === 0) {
      setChildrenError('Au moins un enfant doit être assigné.')
      return
    }
    setChildrenError(null)
    try {
      await parentsApi.update(id, { ...values, child_ids: children.map((c) => c.id) })
      toast.success('Compte parent mis à jour.')
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: () => parentsApi.update(id, { is_active: !parent?.is_active }),
    onSuccess: () => {
      toast.success(parent?.is_active ? 'Compte désactivé.' : 'Compte réactivé.')
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors, isSubmitting: isResetting },
    reset: resetResetForm,
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) })

  const onResetPassword = async (values: ResetForm) => {
    try {
      await parentsApi.resetPassword(id, values.new_password)
      toast.success('Mot de passe réinitialisé et envoyé par email.')
      resetResetForm()
      setResetOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!parent) {
    return <p className="text-muted-foreground">Compte parent introuvable.</p>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="max-w-2xl space-y-4"
    >
      <Link
        href="/dashboard/admin/parents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 text-white" />
        <span className="text-white font-semibold">Retour à la liste</span>
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{parent.nickname || `${parent.first_name} ${parent.last_name}`}</h1>
            <Badge variant={parent.is_active ? 'default' : 'outline'}>
              {parent.is_active ? 'Actif' : 'Inactif'}
            </Badge>
          </div>
          <p className="text-sm text-white">
            Dernière connexion : {formatDateTime(parent.last_login_at)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              <KeyRound className="mr-1.5 size-4" />
              Réinitialiser le mot de passe
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
                <DialogDescription>
                  Le nouveau mot de passe est envoyé par email au parent — il n&apos;a pas à le redéfinir.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleResetSubmit(onResetPassword)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="new_password">Nouveau mot de passe</Label>
                  <Input id="new_password" type="password" {...registerReset('new_password')} aria-invalid={!!resetErrors.new_password} />
                  {resetErrors.new_password && <p className="text-sm text-destructive">{resetErrors.new_password.message}</p>}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isResetting}>
                    {isResetting ? <><Loader2 className="mr-2 size-4 animate-spin" /> Envoi...</> : 'Réinitialiser'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger render={<Button variant={parent.is_active ? 'destructive' : 'outline'} />}>
              <Trash2 className="mr-1.5 size-4 text-white" />
              {parent.is_active ? 'Désactiver' : 'Réactiver'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {parent.is_active ? 'Désactiver ce compte ?' : 'Réactiver ce compte ?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {parent.is_active
                    ? 'Le compte sera désactivé (réversible). Le parent ne pourra plus se connecter.'
                    : 'Le compte redeviendra accessible.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => toggleActiveMutation.mutate()}>
                  Confirmer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInfoSubmit(onSaveInfo)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input id="first_name" {...registerInfo('first_name')} aria-invalid={!!infoErrors.first_name} />
                {infoErrors.first_name && <p className="text-sm text-destructive">{infoErrors.first_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input id="last_name" {...registerInfo('last_name')} aria-invalid={!!infoErrors.last_name} />
                {infoErrors.last_name && <p className="text-sm text-destructive">{infoErrors.last_name.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Surnom</Label>
              <Input id="nickname" {...registerInfo('nickname')} aria-invalid={!!infoErrors.nickname} />
              {infoErrors.nickname && <p className="text-sm text-destructive">{infoErrors.nickname.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...registerInfo('email')} aria-invalid={!!infoErrors.email} />
                {infoErrors.email && <p className="text-sm text-destructive">{infoErrors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" {...registerInfo('phone')} aria-invalid={!!infoErrors.phone} />
                {infoErrors.phone && <p className="text-sm text-destructive">{infoErrors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Enfants assignés</Label>
              <ChildMultiSelect selected={children} onChange={(c) => { setChildren(c); if (c.length > 0) setChildrenError(null) }} />
              {childrenError && <p className="text-sm text-destructive">{childrenError}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { resetInfoForm(); setChildren(parent.assigned_children); setChildrenError(null) }}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSavingInfo}>
                {isSavingInfo ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
