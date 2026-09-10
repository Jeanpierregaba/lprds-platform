'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { staffApi } from '@/lib/api/staff.api'
import { rbacApi } from '@/lib/api/rbac.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { STAFF_TYPE_LABELS, type StaffType } from '@/types/staff'

const infoSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(100),
  last_name:  z.string().min(1, 'Nom requis').max(100),
  nickname:   z.string().min(1, 'Surnom requis').max(100),
  phone:      z.string().min(1, 'Téléphone requis').max(20),
  email:      z.string().email('Email invalide'),
  staff_type: z.string().min(1, 'Type requis'),
})
type InfoForm = z.infer<typeof infoSchema>

const resetSchema = z.object({
  new_password: z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type ResetForm = z.infer<typeof resetSchema>

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.get(id).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['staff', id] })

  const {
    register: registerInfo,
    handleSubmit: handleInfoSubmit,
    control,
    formState: { errors: infoErrors, isSubmitting: isSavingInfo },
    reset: resetInfoForm,
  } = useForm<InfoForm>({
    resolver: zodResolver(infoSchema),
    defaultValues: { first_name: '', last_name: '', nickname: '', phone: '', email: '', staff_type: '' },
    values: staff
      ? {
          first_name: staff.first_name, last_name: staff.last_name, nickname: staff.nickname ?? '',
          phone: staff.phone ?? '', email: staff.email, staff_type: staff.staff_type ?? '',
        }
      : undefined,
  })

  const onSaveInfo = async (values: InfoForm) => {
    try {
      await staffApi.update(id, { ...values, staff_type: values.staff_type as StaffType })
      toast.success('Membre du personnel mis à jour.')
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: () => staffApi.setStatus(id, !staff?.is_active),
    onSuccess: () => {
      toast.success(staff?.is_active ? 'Compte désactivé.' : 'Compte réactivé.')
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
      await staffApi.resetPassword(id, values.new_password)
      toast.success('Mot de passe réinitialisé et envoyé par email.')
      resetResetForm()
      setResetOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!staff) {
    return <p className="text-muted-foreground">Membre du personnel introuvable.</p>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="max-w-3xl space-y-4"
    >
      <Link
        href="/dashboard/admin/staff"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 text-white font-semibold"/>
        <span className="text-white font-semibold">Retour à la liste</span>
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{staff.nickname || `${staff.first_name} ${staff.last_name}`}</h1>
            <Badge variant={staff.is_active ? 'default' : 'outline'}>
              {staff.is_active ? 'Actif' : 'Inactif'}
            </Badge>
          </div>
          <p className="font-mono text-sm text-white font-semibold">{staff.matricule ?? '—'}</p>
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
                  Le nouveau mot de passe est envoyé par email au personnel — il n&apos;a pas à le redéfinir.
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
            <AlertDialogTrigger render={<Button variant={staff.is_active ? 'destructive' : 'outline'} />}>
              {staff.is_active ? 'Désactiver' : 'Réactiver'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {staff.is_active ? 'Désactiver ce compte ?' : 'Réactiver ce compte ?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {staff.is_active
                    ? 'Le compte sera désactivé (réversible). La personne ne pourra plus se connecter.'
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

      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">Infos</TabsTrigger>
          <TabsTrigger value="roles">Rôles RBAC</TabsTrigger>
        </TabsList>

        <TabsContent value="infos">
          <Card>
            <CardContent className="pt-6">
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
                  <Label htmlFor="staff_type">Type de poste</Label>
                  <Controller
                    control={control}
                    name="staff_type"
                    render={({ field }) => (
                      <Select items={STAFF_TYPE_LABELS} value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="staff_type" className="w-full" aria-invalid={!!infoErrors.staff_type}>
                          <SelectValue placeholder="Choisir un type" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STAFF_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {infoErrors.staff_type && <p className="text-sm text-destructive">{infoErrors.staff_type.message}</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => resetInfoForm()}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSavingInfo}>
                    {isSavingInfo ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <StaffRolesCard staffId={id} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}

function StaffRolesCard({ staffId }: { staffId: string }) {
  const queryClient = useQueryClient()

  const { data: roles } = useQuery({
    queryKey: ['roles', { includeInactive: false }],
    queryFn: () => rbacApi.listRoles(false).then((r) => r.data),
  })

  const { data: userRoles, isLoading } = useQuery({
    queryKey: ['user-roles', staffId],
    queryFn: () => rbacApi.getUserRoles(staffId).then((r) => r.data),
  })

  const invalidateUserRoles = () => queryClient.invalidateQueries({ queryKey: ['user-roles', staffId] })

  const assignMutation = useMutation({
    mutationFn: (roleId: string) => rbacApi.assignRole(staffId, roleId),
    onSuccess: () => {
      toast.success('Rôle attribué.')
      invalidateUserRoles()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const revokeMutation = useMutation({
    mutationFn: (roleId: string) => rbacApi.revokeRole(staffId, roleId),
    onSuccess: () => {
      toast.success('Rôle révoqué.')
      invalidateUserRoles()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const assignedRoleIds = new Set(userRoles?.roles.map((r) => r.id) ?? [])
  const availableRoles = roles?.filter((r) => !assignedRoleIds.has(r.id)) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rôles attribués</CardTitle>
        <CardDescription>Les droits effectifs de ce membre du personnel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {userRoles?.roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun rôle attribué.</p>
              ) : (
                userRoles?.roles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm font-medium">{role.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Révoquer ${role.name}`}
                      onClick={() => revokeMutation.mutate(role.id)}
                      disabled={revokeMutation.isPending}
                    >
                      <X className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {availableRoles.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Attribuer un rôle</p>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((role) => (
                    <Button
                      key={role.id}
                      variant="outline"
                      size="sm"
                      onClick={() => assignMutation.mutate(role.id)}
                      disabled={assignMutation.isPending}
                    >
                      {assignMutation.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                      {role.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : roles?.length === 0 ? (
              <div className="flex flex-col items-center gap-2 border-t border-border py-6 pt-6 text-center text-muted-foreground">
                <ShieldCheck className="size-6" />
                <p className="text-sm">
                  Aucun rôle n&apos;existe encore. Créez-en depuis Rôles &amp; permissions.
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
