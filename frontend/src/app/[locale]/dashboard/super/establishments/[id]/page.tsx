'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useParams } from 'next/navigation'
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
import { Link } from '@/i18n/navigation'

type T = (key: string) => string

const MAX_ADMINS = 3

const makeinfoSchema = (t: T) => z.object({
  code:    z.string().min(2).max(10).regex(/^[A-Za-z0-9]+$/, t('establishments.validation.alphanumeric')),
  name:    z.string().min(1, t('establishments.validation.name')).max(200),
  address: z.string().min(1, t('establishments.validation.address')).max(500),
  email:   z.string().email(t('establishments.validation.email')),
  phone:   z.string().min(1, t('establishments.validation.phone')).max(20),
})
type InfoForm = z.infer<ReturnType<typeof makeinfoSchema>>

const makeadminSchema = (t: T) => z.object({
  first_name: z.string().min(1, t('establishments.validation.firstName')).max(100),
  last_name:  z.string().min(1, t('establishments.validation.name')).max(100),
  email:      z.string().email(t('establishments.validation.email')),
  phone:      z.string().max(20).optional().or(z.literal('')),
  password:   z.string()
    .min(8, t('establishments.validation.passwordMin'))
    .regex(/[A-Z]/, t('establishments.validation.passwordUpper'))
    .regex(/[0-9]/, t('establishments.validation.passwordDigit')),
})
type AdminForm = z.infer<ReturnType<typeof makeadminSchema>>

export default function EstablishmentDetailPage() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
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
    resolver: zodResolver(makeinfoSchema(t)),
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
      toast.success(t('establishments.updated'))
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: () => establishmentsApi.update(id, { is_active: !establishment?.is_active }),
    onSuccess: () => {
      toast.success(establishment?.is_active ? t('establishments.deactivated') : t('establishments.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    formState: { errors: adminErrors, isSubmitting: isAddingAdmin },
    reset: resetAdminForm,
  } = useForm<AdminForm>({ resolver: zodResolver(makeadminSchema(t)) })

  const onAddAdmin = async (values: AdminForm) => {
    try {
      await establishmentsApi.addAdmin(id, { ...values, phone: values.phone || undefined })
      toast.success(t('establishments.adminAdded'))
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
      toast.success(t('establishments.adminRemoved'))
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
    return <p className="text-muted-foreground">{t('establishments.notFound')}</p>
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
        {t('establishments.back')}
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{establishment.name}</h1>
            <Badge variant={establishment.is_active ? 'default' : 'outline'}>
              {establishment.is_active ? t('establishments.activeLabel') : t('establishments.inactiveLabel')}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">{establishment.code}</p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger render={<Button variant={establishment.is_active ? 'destructive' : 'outline'} />}>
            {establishment.is_active ? t('establishments.deactivate') : t('establishments.reactivate')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {establishment.is_active ? t('establishments.deactivateTitle') : t('establishments.reactivateTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {establishment.is_active
                  ? t('establishments.deactivateBody')
                  : t('establishments.reactivateBody')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => toggleActiveMutation.mutate()}>
                {t('establishments.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">{t('establishments.tabInfos')}</TabsTrigger>
          <TabsTrigger value="admins">Administrateurs ({admins.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="infos">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleInfoSubmit(onSaveInfo)} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="code">{t('establishments.code')}</Label>
                    <Input id="code" {...registerInfo('code')} aria-invalid={!!infoErrors.code} />
                    {infoErrors.code && <p className="text-sm text-destructive">{infoErrors.code.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('establishments.name')}</Label>
                    <Input id="name" {...registerInfo('name')} aria-invalid={!!infoErrors.name} />
                    {infoErrors.name && <p className="text-sm text-destructive">{infoErrors.name.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">{t('establishments.address')}</Label>
                  <Input id="address" {...registerInfo('address')} aria-invalid={!!infoErrors.address} />
                  {infoErrors.address && <p className="text-sm text-destructive">{infoErrors.address.message}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('establishments.email')}</Label>
                    <Input id="email" type="email" {...registerInfo('email')} aria-invalid={!!infoErrors.email} />
                    {infoErrors.email && <p className="text-sm text-destructive">{infoErrors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('establishments.phone')}</Label>
                    <Input id="phone" {...registerInfo('phone')} aria-invalid={!!infoErrors.phone} />
                    {infoErrors.phone && <p className="text-sm text-destructive">{infoErrors.phone.message}</p>}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => resetInfoForm()}>
                    {t('establishments.cancel')}
                  </Button>
                  <Button type="submit" disabled={isSavingInfo}>
                    {isSavingInfo ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('establishments.saving')}</> : t('establishments.save')}
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
                <CardTitle className="text-base">{t('establishments.adminsTitle')}</CardTitle>
                <CardDescription>{t('establishments.adminsHint', { max: MAX_ADMINS })}</CardDescription>
              </div>

              <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
                {canAddAdmin ? (
                  <DialogTrigger render={<Button />}>
                    <Plus className="mr-1.5 size-4" />
                    {t('establishments.addAdmin')}
                  </DialogTrigger>
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                      <Button disabled>
                        <Plus className="mr-1.5 size-4" />
                        {t('establishments.addAdmin')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Maximum {MAX_ADMINS} administrateurs atteint.</TooltipContent>
                  </Tooltip>
                )}
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('establishments.addAdminTitle')}</DialogTitle>
                    <DialogDescription>{t('temporaryPasswordHint')}</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAdminSubmit(onAddAdmin)} className="space-y-4" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="a_first_name">{t('establishments.firstName')}</Label>
                        <Input id="a_first_name" {...registerAdmin('first_name')} aria-invalid={!!adminErrors.first_name} />
                        {adminErrors.first_name && <p className="text-sm text-destructive">{adminErrors.first_name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="a_last_name">{t('establishments.lastName')}</Label>
                        <Input id="a_last_name" {...registerAdmin('last_name')} aria-invalid={!!adminErrors.last_name} />
                        {adminErrors.last_name && <p className="text-sm text-destructive">{adminErrors.last_name.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="a_email">{t('establishments.email')}</Label>
                      <Input id="a_email" type="email" {...registerAdmin('email')} aria-invalid={!!adminErrors.email} />
                      {adminErrors.email && <p className="text-sm text-destructive">{adminErrors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="a_phone">{t('establishments.phoneOptional')}</Label>
                      <Input id="a_phone" {...registerAdmin('phone')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="a_password">{t('establishments.tempPassword')}</Label>
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
                    <TableHead>{t('establishments.name')}</TableHead>
                    <TableHead>{t('establishments.email')}</TableHead>
                    <TableHead>{t('establishments.phone')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t('noAdmin')}</TableCell>
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
                                aria-label={t('establishments.removeAdmin', { name: `${admin.first_name} ${admin.last_name}` })}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('establishments.removeAdminTitle', { name: `${admin.first_name} ${admin.last_name}` })}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('establishments.removeAdminBody')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tCommon('actions.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeAdminMutation.mutate(admin.id)}>
                                    {t('establishments.remove')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                                <Button variant="ghost" size="icon-sm" disabled aria-label={t('establishments.removeAdmin', { name: `${admin.first_name} ${admin.last_name}` })}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('establishments.lastAdmin')}</TooltipContent>
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
