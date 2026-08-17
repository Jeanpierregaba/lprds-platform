'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { establishmentsApi } from '@/lib/api/establishments.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const MAX_ADMINS = 3

const infoSchema = z.object({
  code:    z.string().min(2).max(10).regex(/^[A-Za-z0-9]+$/, 'Alphanumérique uniquement'),
  name:    z.string().min(1, 'Nom requis').max(200),
  address: z.string().min(1, 'Adresse requise').max(500),
  email:   z.string().email('Email invalide'),
  phone:   z.string().min(1, 'Téléphone requis').max(20),
})
type InfoForm = z.infer<typeof infoSchema>

const adminSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(100),
  last_name:  z.string().min(1, 'Nom requis').max(100),
  email:      z.string().email('Email invalide'),
  phone:      z.string().max(20).optional().or(z.literal('')),
  password:   z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type AdminForm = z.infer<typeof adminSchema>

export default function EstablishmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [addAdminOpen, setAddAdminOpen] = useState(false)

  const { data: establishment, isLoading } = useQuery({
    queryKey: ['establishment', id],
    queryFn: () => establishmentsApi.get(id).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['establishment', id] })

  const {
    register: registerInfo,
    handleSubmit: handleInfoSubmit,
    formState: { errors: infoErrors, isSubmitting: isSavingInfo },
    reset: resetInfoForm,
  } = useForm<InfoForm>({
    resolver: zodResolver(infoSchema),
    values: establishment
      ? {
          code: establishment.code, name: establishment.name, address: establishment.address,
          email: establishment.email, phone: establishment.phone,
        }
      : undefined,
  })

  const onSaveInfo = async (values: InfoForm) => {
    try {
      await establishmentsApi.update(id, { ...values, code: values.code.toUpperCase() })
      toast.success('Établissement mis à jour.')
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: () => establishmentsApi.update(id, { is_active: !establishment?.is_active }),
    onSuccess: () => {
      toast.success(establishment?.is_active ? 'Établissement désactivé.' : 'Établissement réactivé.')
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    formState: { errors: adminErrors, isSubmitting: isAddingAdmin },
    reset: resetAdminForm,
  } = useForm<AdminForm>({ resolver: zodResolver(adminSchema) })

  const onAddAdmin = async (values: AdminForm) => {
    try {
      await establishmentsApi.addAdmin(id, { ...values, phone: values.phone || undefined })
      toast.success('Administrateur ajouté.')
      resetAdminForm()
      setAddAdminOpen(false)
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const removeAdminMutation = useMutation({
    mutationFn: (userId: string) => establishmentsApi.removeAdmin(id, userId),
    onSuccess: () => {
      toast.success('Administrateur retiré.')
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!establishment) {
    return <p className="text-muted-foreground">Établissement introuvable.</p>
  }

  const admins = establishment.admins
  const canAddAdmin = admins.length < MAX_ADMINS
  const canRemoveAdmin = admins.length > 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="max-w-3xl space-y-4"
    >
      <Link
        href="/dashboard/super/establishments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour à la liste
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{establishment.name}</h1>
            <Badge variant={establishment.is_active ? 'default' : 'outline'}>
              {establishment.is_active ? 'Actif' : 'Inactif'}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">{establishment.code}</p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger render={<Button variant={establishment.is_active ? 'destructive' : 'outline'} />}>
            {establishment.is_active ? 'Désactiver' : 'Réactiver'}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {establishment.is_active ? 'Désactiver cet établissement ?' : 'Réactiver cet établissement ?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {establishment.is_active
                  ? 'L\'établissement sera désactivé (désactivation réversible). Ses membres ne pourront plus l\'utiliser.'
                  : 'L\'établissement redeviendra accessible à ses membres.'}
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

      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">Infos</TabsTrigger>
          <TabsTrigger value="admins">Administrateurs ({admins.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="infos">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleInfoSubmit(onSaveInfo)} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input id="code" {...registerInfo('code')} aria-invalid={!!infoErrors.code} />
                    {infoErrors.code && <p className="text-sm text-destructive">{infoErrors.code.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom</Label>
                    <Input id="name" {...registerInfo('name')} aria-invalid={!!infoErrors.name} />
                    {infoErrors.name && <p className="text-sm text-destructive">{infoErrors.name.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input id="address" {...registerInfo('address')} aria-invalid={!!infoErrors.address} />
                  {infoErrors.address && <p className="text-sm text-destructive">{infoErrors.address.message}</p>}
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

        <TabsContent value="admins">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Administrateurs actifs</CardTitle>
                <CardDescription>Maximum {MAX_ADMINS} par établissement.</CardDescription>
              </div>

              <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
                {canAddAdmin ? (
                  <DialogTrigger render={<Button />}>
                    <Plus className="mr-1.5 size-4" />
                    Ajouter un admin
                  </DialogTrigger>
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                      <Button disabled>
                        <Plus className="mr-1.5 size-4" />
                        Ajouter un admin
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Maximum {MAX_ADMINS} administrateurs atteint.</TooltipContent>
                  </Tooltip>
                )}
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ajouter un administrateur</DialogTitle>
                    <DialogDescription>
                      Le mot de passe est temporaire — l&apos;admin devra le changer à sa première connexion.
                      Transmettez-le hors plateforme (aucun email n&apos;est envoyé).
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAdminSubmit(onAddAdmin)} className="space-y-4" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="a_first_name">Prénom</Label>
                        <Input id="a_first_name" {...registerAdmin('first_name')} aria-invalid={!!adminErrors.first_name} />
                        {adminErrors.first_name && <p className="text-sm text-destructive">{adminErrors.first_name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="a_last_name">Nom</Label>
                        <Input id="a_last_name" {...registerAdmin('last_name')} aria-invalid={!!adminErrors.last_name} />
                        {adminErrors.last_name && <p className="text-sm text-destructive">{adminErrors.last_name.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="a_email">Email</Label>
                      <Input id="a_email" type="email" {...registerAdmin('email')} aria-invalid={!!adminErrors.email} />
                      {adminErrors.email && <p className="text-sm text-destructive">{adminErrors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="a_phone">Téléphone (optionnel)</Label>
                      <Input id="a_phone" {...registerAdmin('phone')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="a_password">Mot de passe temporaire</Label>
                      <Input id="a_password" type="password" {...registerAdmin('password')} aria-invalid={!!adminErrors.password} />
                      {adminErrors.password && <p className="text-sm text-destructive">{adminErrors.password.message}</p>}
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isAddingAdmin}>
                        {isAddingAdmin ? <><Loader2 className="mr-2 size-4 animate-spin" /> Ajout...</> : 'Ajouter'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        Aucun administrateur.
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell className="font-medium">{admin.first_name} {admin.last_name}</TableCell>
                        <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                        <TableCell className="text-muted-foreground">{admin.phone ?? '—'}</TableCell>
                        <TableCell>
                          {canRemoveAdmin ? (
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={<Button variant="ghost" size="icon-sm" />}
                                aria-label={`Retirer ${admin.first_name} ${admin.last_name}`}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Retirer {admin.first_name} {admin.last_name} ?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Son compte sera désactivé. Cette action est réversible par le support.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeAdminMutation.mutate(admin.id)}>
                                    Retirer
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                                <Button variant="ghost" size="icon-sm" disabled aria-label={`Retirer ${admin.first_name} ${admin.last_name}`}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Impossible de retirer le dernier administrateur.</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
